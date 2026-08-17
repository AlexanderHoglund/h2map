/**
 * Pure fuel-emissions evaluator. The functional unit is ENERGY DELIVERED
 * ON BOARD (MJ): a tonne of green fuel does not replace a tonne of fossil
 * fuel (e-ammonia at 18,600 MJ/t replaces ~459.3 t of HFO per 1,000 t,
 * not 1,000 t — golden fixture F1 exists to catch the tonne-for-tonne
 * trap, which overstates avoided emissions 2.4×).
 *
 * Framework values are never blended: one framework id selects every
 * factor AND the GWP set (FuelEU Annex II → AR4; IMO LCA → AR5); a GWP
 * override exists for sensitivity only and still applies as ONE set. A
 * fuel missing a needed factor is reported `notParameterised` — never
 * defaulted to zero, never borrowed from a neighbouring row.
 *
 * Exhaustive decomposition: each side's emissions split into WtT +
 * TtW(CO2, CH4·GWP, N2O·GWP) + pilot fuel + N2O slip, summing exactly to
 * the side total (property-tested at 1e-9).
 */

import type { FuelEmissionsRefDataset, RefFuel } from "./ref";
import {
  carbonBalanceError,
  getFramework,
  getFuel,
  getGwpSet,
  missingParameters,
} from "./ref";

/**
 * FuelEU Maritime's 2020 fleet-average reference intensity, gCO2e/MJ —
 * the target ladder's anchor (Regulation (EU) 2023/1805, Article 4(2)).
 * Reported alongside the IMO 2008 GFI reference (93.3, from the dataset).
 */
export const FUELEU_BASELINE_GCO2E_PER_MJ = 91.16;

export interface FuelEmissionsInput {
  candidateFuelId: string;
  /**
   * Tonnes of the fuel named by `quantityBasis` (default: the candidate).
   * With `"baseline"` the tool runs BACKWARDS: quantity is the fossil
   * mass to replace, and the engine derives the candidate mass needed.
   */
  quantityTonnes: number;
  quantityBasis?: "candidate" | "baseline";
  baselineFuelId: string;
  /**
   * Baseline sulphur content, mass % (default 0.50 — typical VLSFO).
   * Only consulted under the IMO framework, which bins residual fuels by
   * sulphur band (MEPC.391(81)) rather than ISO 8217 viscosity grade.
   */
  baselineSulphurPercent?: number;
  /** Framework id ("fueleu" | "imo"); selects factors AND the GWP set. */
  frameworkId: string;
  /** Sensitivity only — still exactly one set per evaluation. */
  gwpSetOverride?: string;
  /**
   * Certified pathway intensity for pathway-dependent fuels, applied
   * WELL-TO-TANK: it fills the wtt slot and combustion terms are added
   * separately (the N2O slip for ammonia) — entering a well-to-wake
   * certificate figure here would double-count the slip. REQUIRED for
   * fuels whose WtT is a range, ignored for fixed-row fuels. Never
   * defaulted — a zero-emission pathway is an assumption, not a
   * certifiable value. (Field name is historical; semantics are WtT.)
   */
  candidateWtwGco2ePerMj?: number;
  /** Share of TOTAL delivered energy burned as fossil pilot (0–1). */
  pilotShare?: number;
  pilotFuelId?: string;
  /**
   * Engine technology id (methaneSlip.byEngine) — REQUIRED for fuels
   * flagged `requiresEngineType` (LNG): Cslip differs per technology and
   * per framework, and is the dominant term in LNG's result.
   */
  engineType?: string;
  /** Ammonia combustion N2O slip, g N2O per g fuel. */
  n2oSlipGPerG?: number;
  /**
   * GWP applied to the SLIP term only (fixture F4's convention: neither
   * framework fixes an ammonia N2O default, so the slip is an
   * engine-behaviour sensitivity that may be priced at e.g. AR6 273 while
   * the framework's factor set stays intact). Framework factors are never
   * mixed; this override cannot touch them.
   */
  n2oSlipGwpOverride?: number;
  /** Alternative-engine efficiency ÷ baseline-engine efficiency. */
  efficiencyRatio?: number;
}

export interface EmissionParts {
  wttTco2e: number;
  ttwCo2Tco2e: number;
  ttwCh4Tco2e: number;
  ttwN2oTco2e: number;
  /** Candidate side only: ammonia combustion N2O slip. */
  n2oSlipTco2e: number;
  /** Candidate side only: the fossil pilot priced at its FULL intensity. */
  pilotTco2e: number;
}

export interface SideResult {
  energyMj: number;
  intensityGco2ePerMj: number;
  emissionsTco2e: number;
  parts: EmissionParts;
}

export interface BasisResult {
  candidate: SideResult;
  baseline: SideResult;
  avoidedTco2e: number;
  reductionPercent: number;
  /** Candidate emissions over TOTAL delivered energy (fuel + pilot). */
  blendIntensityGco2ePerMj: number;
  /**
   * The pilot line split into lifecycle stages (round-2 fix E): the
   * pilot row cuts across the stage rows and hides upstream tonnes
   * inside it — wttTco2e + ttwTco2e === parts.pilotTco2e exactly. On the
   * tank-to-wake basis wttTco2e is 0 by construction.
   */
  pilotSplit: { wttTco2e: number; ttwTco2e: number };
}

export interface NotParameterised {
  notParameterised: true;
  fuelId: string;
  missing: string[];
  /** The dataset's own review note, verbatim, for the UI. */
  reviewNote?: string;
}

/**
 * What the EU ETS actually charges for, per tonne of candidate fuel.
 *
 * SEPARATE FROM `tankToWake` ON PURPOSE. The TtW basis reports stack
 * chemistry — methanol's 1.375 gCO2/g is real and belongs there — and it is
 * read by FuelEU, the IMO GFI and the abatement delta. ETS asks a narrower
 * question: how much of that carbon was dug up? Netting the biogenic share
 * inside `tankToWake` would silently move all four consumers, so the ETS view
 * is computed alongside it and only the ETS module reads it.
 *
 * The split mirrors the Directive: `co2Tco2e` is zero-rateable by carbon
 * origin; `nonCo2Tco2e` is NOT — CH4 and N2O are charged on warming effect
 * from 2026 whatever the carbon's provenance, which is why a bio-LNG row
 * still pays for methane slip and an ammonia row still pays for N2O slip.
 */
export interface EtsChargeable {
  /** Chargeable combustion CO2: candidate CO2 x fossilCarbonShare. */
  co2Tco2e: number;
  /** Chargeable CH4 + N2O incl. slip — never zero-rated by carbon origin. */
  nonCo2Tco2e: number;
  /** The fossil pilot's own emissions, always chargeable in full. */
  pilotTco2e: number;
  /** co2 + nonCo2 + pilot, per the candidate quantity evaluated. */
  totalTco2e: number;
  /** The share applied to the candidate's combustion CO2 (1 = fully fossil). */
  fossilCarbonShare: number;
  /**
   * Non-CO2 gas MASS per tonne of candidate fuel — t of gas, not CO2e.
   *
   * Exposed unweighted so a consumer can pair them with its own GWP set: the
   * ETS module keeps GWPs as separate inputs, and pre-multiplying here would
   * make a framework switch silently inconsistent. `ch4` includes engine
   * slip, which dominates for LNG.
   */
  ch4TPerTonneFuel: number;
  n2oTPerTonneFuel: number;
  /** The GWP set in force for this evaluation (AR4 FuelEU / AR5 IMO). */
  gwpCh4: number;
  gwpN2o: number;
}

export interface FuelEmissionsResult {
  notParameterised?: undefined;
  datasetVersion: string;
  frameworkId: string;
  gwpSetId: string;
  candidateEnergyMj: number;
  /** Candidate mass, both directions (forward: the input quantity). */
  candidateMassTonnes: number;
  pilotEnergyMj: number;
  totalEnergyMj: number;
  baselineEnergyMj: number;
  equivalentBaselineMassTonnes: number;
  /**
   * The baseline row's name under the ACTIVE framework's classification:
   * the ISO 8217 grade under FuelEU, the sulphur band under IMO — the
   * same physical bunker lands in different bins (fix B).
   */
  baselineLabel: string;
  /**
   * Factors carried from FuelEU Annex II because the selected framework
   * has no confirmed own value (short labels, e.g. "pilot WtT (MGO)").
   * Empty when every factor is native to the framework.
   */
  substitutedFactors: string[];
  wellToWake: BasisResult;
  tankToWake: BasisResult;
  znz: {
    /**
     * The candidate FUEL's own WtW intensity (incl. slip, excl. pilot) —
     * the ZNZ eligibility basis: the threshold applies to the fuel /
     * energy source itself (MEPC 83 approved text; IMO NZF FAQ), not to
     * the ship's attained blended GFI.
     */
    fuelWtwGco2ePerMj: number;
    /** Attained-GFI analogue: candidate emissions over TOTAL energy. */
    blendWtwGco2ePerMj: number;
    thresholdTo2034: number;
    thresholdFrom2035: number;
    compliantTo2034: boolean;
    compliantFrom2035: boolean;
  };
  /** What the EU ETS charges for — see `EtsChargeable`. */
  etsChargeable: EtsChargeable;
  references: {
    imoGfi2008: number;
    fuelEuBaseline: number;
  };
}

interface Intensity {
  wtt: number;
  ttwCo2: number;
  ttwCh4: number;
  ttwN2o: number;
}

/**
 * Per-MJ intensity components of a FIXED-row fuel under one GWP set.
 * `cslip` (LNG): the mass fraction escaping combustion as CH4 at 50%
 * load — (1−Cslip) of the fuel combusts, Cslip is priced as CH4 in the
 * combustion-CH4 term.
 */
function rowIntensity(
  fuel: RefFuel,
  gwp: { ch4: number; n2o: number },
  cslip = 0,
  wttOverride?: number,
): Intensity {
  const lcv = fuel.lcvMjPerG;
  const n2o = typeof fuel.ttw.n2oGPerG === "number" ? fuel.ttw.n2oGPerG : 0;
  const burn = 1 - cslip;
  return {
    wtt: wttOverride ?? fuel.wttGco2ePerMj ?? 0,
    ttwCo2: ((fuel.ttw.co2GPerG ?? 0) * burn) / lcv,
    ttwCh4: (((fuel.ttw.ch4GPerG ?? 0) * burn + cslip) * gwp.ch4) / lcv,
    ttwN2o: (n2o * burn * gwp.n2o) / lcv,
  };
}

export function evaluateFuelEmissions(
  input: FuelEmissionsInput,
  ds: FuelEmissionsRefDataset,
): FuelEmissionsResult | NotParameterised {
  const framework = getFramework(ds, input.frameworkId);
  const gwpSetId = input.gwpSetOverride ?? framework.defaultGwpSet;
  const gwp = getGwpSet(ds, gwpSetId);

  const candidate = getFuel(ds, input.candidateFuelId);
  const baseline = getFuel(ds, input.baselineFuelId);

  // --- the not-parameterised gate (never zero, never a neighbour) --------
  // A row can be framework-barred despite carrying values: LNG's WtT is
  // FuelEU's default; the IMO guidelines have no upstream factor and a
  // missing upstream term flatters LNG — refuse, never borrow.
  if (candidate.unavailableUnder?.includes(input.frameworkId)) {
    return {
      notParameterised: true,
      fuelId: candidate.id,
      missing: [`wttGco2ePerMj (no default upstream factor under ${framework.name})`],
      reviewNote: candidate.reviewNote,
    };
  }
  const pathwayFuel = candidate.wttGco2ePerMj === null && !!candidate.wttRangeGco2ePerMj;
  // A valid engine-technology id satisfies the requiresEngineType gate.
  const engineSlipRow = input.engineType
    ? ds.methaneSlip.byEngine.find((e) => e.engine === input.engineType)
    : undefined;
  for (const [fuel, role] of [
    [candidate, "candidate"],
    [baseline, "baseline"],
  ] as const) {
    const missing = missingParameters(fuel).filter(
      (m) =>
        // A pathway WtT range is satisfiable by the certified-value input.
        !(fuel.id === candidate.id && pathwayFuel && m === "wttGco2ePerMj") &&
        !(fuel.id === candidate.id && engineSlipRow && m.startsWith("engineType")),
    );
    if (missing.length > 0) {
      return {
        notParameterised: true,
        fuelId: fuel.id,
        missing: role === "candidate" ? missing : missing.map((m) => `baseline ${m}`),
        reviewNote: fuel.reviewNote,
      };
    }
  }
  if (pathwayFuel && input.candidateWtwGco2ePerMj == null) {
    return {
      notParameterised: true,
      fuelId: candidate.id,
      missing: ["candidateWtwGco2ePerMj (certified pathway E-value)"],
      reviewNote: candidate.reviewNote,
    };
  }
  // A stated WtW below the row's own stack intensity is only reachable if
  // the carbon was captured — refuse rather than let the model net it in
  // one place and charge for it in another. See `carbonBalanceError`.
  //
  // ONLY the certified pathway value is a well-to-WAKE figure. A fixed row's
  // `wttGco2ePerMj` is well-to-TANK — upstream only — so comparing it against
  // combustion intensity is a category error that refuses every fossil fuel
  // (LNG: WtT 18.5 against a 57.3 stack). Pass undefined for those; the gate
  // then no-ops, which is correct because a fixed row states no WtW at all.
  const imbalance = carbonBalanceError(candidate, input.candidateWtwGco2ePerMj);
  if (imbalance) {
    return {
      notParameterised: true,
      fuelId: candidate.id,
      missing: [imbalance],
      reviewNote: candidate.reviewNote,
    };
  }

  // --- energy bookkeeping (the functional unit) --------------------------
  // Both directions normalize onto candidate mass: forward takes it from
  // the input; reverse ("how much green fuel replaces X t of fossil?")
  // derives it from the baseline energy. Everything downstream is shared.
  const pilotShare = input.pilotShare ?? 0;
  const efficiencyRatio = input.efficiencyRatio ?? ds.engineEfficiencyRatio.default;
  let candidateEnergyMj: number;
  if (input.quantityBasis === "baseline") {
    const baselineEnergyIn = input.quantityTonnes * 1e6 * baseline.lcvMjPerG;
    candidateEnergyMj = (baselineEnergyIn / efficiencyRatio) * (1 - pilotShare);
  } else {
    candidateEnergyMj = input.quantityTonnes * 1e6 * candidate.lcvMjPerG;
  }
  const candidateMassTonnes = candidateEnergyMj / (candidate.lcvMjPerG * 1e6);
  const totalEnergyMj = candidateEnergyMj / (1 - pilotShare);
  const pilotEnergyMj = totalEnergyMj - candidateEnergyMj;
  const baselineEnergyMj = totalEnergyMj * efficiencyRatio;
  const equivalentBaselineMassTonnes = baselineEnergyMj / (baseline.lcvMjPerG * 1e6);

  const pilot =
    pilotShare > 0 ? getFuel(ds, input.pilotFuelId ?? ds.pilotFuel.defaultPilotFuelId) : null;
  if (pilot) {
    const missing = missingParameters(pilot);
    if (missing.length > 0) {
      return {
        notParameterised: true,
        fuelId: pilot.id,
        missing: missing.map((m) => `pilot ${m}`),
        reviewNote: pilot.reviewNote,
      };
    }
  }

  // --- per-framework fossil WtT resolution (fixes A/B/C) -----------------
  // The IMO publishes its OWN fossil WtT defaults, binned by sulphur
  // (MEPC.391(81)): residual fuels resolve to the band, NOT to FuelEU's
  // viscosity-row value — the two differ by 3.3 gCO2e/MJ for a typical
  // 0.50%-S VLSFO. Distillates have no confirmed IMO value yet: the
  // Annex II number is substituted and DISCLOSED per factor.
  const substitutedFactors: string[] = [];
  const shortName = (f: RefFuel) => f.name.split(" (")[0];
  const resolveFossil = (
    fuel: RefFuel,
    role: "baseline" | "pilot",
  ): { wtt: number | undefined; label: string } => {
    if (input.frameworkId !== "imo" || fuel.family !== "fossil") {
      return { wtt: undefined, label: fuel.name };
    }
    // Fix D: LCVs demonstrably diverge across frameworks (IMO implies
    // 0.0480 for LNG vs Annex II's 0.0491) and the residual/distillate
    // IMO LCVs are UNCONFIRMED — the Annex II LCV in the TtW denominator
    // is itself a disclosed substitution, not a verified carryover.
    substitutedFactors.push(`${role} LCV (${shortName(fuel)})`);
    if (fuel.imoClass === "residual") {
      const s = input.baselineSulphurPercent ?? 0.5;
      const bands = ds.imoFossilWtt.residualBySulphur;
      const band =
        bands.find((b) => b.maxSulphurPercent !== null && s <= b.maxSulphurPercent) ??
        bands[bands.length - 1]!;
      return { wtt: band.wttGco2ePerMj, label: band.label };
    }
    substitutedFactors.push(`${role} WtT (${shortName(fuel)})`);
    return { wtt: undefined, label: fuel.name };
  };
  const baseResolved = resolveFossil(baseline, "baseline");

  // --- intensities under the ONE selected GWP set ------------------------
  const baseInt = rowIntensity(baseline, gwp, 0, baseResolved.wtt);
  // Pathway fuels (certified E-value): the WtW basis uses the certified
  // value as the WHOLE pathway intensity — for e-methanol the certificate
  // resolves whether the combustion carbon counts (DAC vs point-source).
  // The TANK-TO-WAKE basis stays chemical: the row's stack factors (zero
  // for e-ammonia by chemistry, 69.1 gCO2/MJ for e-methanol — a carbon
  // molecule regardless of accounting).
  const cslip =
    candidate.requiresEngineType && engineSlipRow
      ? input.frameworkId === "imo"
        ? engineSlipRow.imo
        : engineSlipRow.fueleu
      : 0;
  const candChemical = rowIntensity(candidate, gwp, cslip);
  const candInt: Intensity = pathwayFuel
    ? {
        wtt: input.candidateWtwGco2ePerMj!,
        ttwCo2: 0,
        ttwCh4: 0,
        ttwN2o: 0,
      }
    : candChemical;
  const slipGwp = input.n2oSlipGwpOverride ?? gwp.n2o;
  const slipPerMj = ((input.n2oSlipGPerG ?? 0) * slipGwp) / candidate.lcvMjPerG;
  const pilotResolved = pilot ? resolveFossil(pilot, "pilot") : null;
  const pilotInt = pilot ? rowIntensity(pilot, gwp, 0, pilotResolved?.wtt) : null;

  const basisResult = (basis: "wellToWake" | "tankToWake"): BasisResult => {
    const wtw = basis === "wellToWake";
    const intensityOf = (i: Intensity): number =>
      (wtw ? i.wtt : 0) + i.ttwCo2 + i.ttwCh4 + i.ttwN2o;

    const g2t = 1e-6; // gCO2e → tCO2e over MJ energies

    const baselineParts: EmissionParts = {
      wttTco2e: (wtw ? baseInt.wtt : 0) * baselineEnergyMj * g2t,
      ttwCo2Tco2e: baseInt.ttwCo2 * baselineEnergyMj * g2t,
      ttwCh4Tco2e: baseInt.ttwCh4 * baselineEnergyMj * g2t,
      ttwN2oTco2e: baseInt.ttwN2o * baselineEnergyMj * g2t,
      n2oSlipTco2e: 0,
      pilotTco2e: 0,
    };
    // Per-basis candidate intensity: certified pathway value on WtW,
    // chemical stack factors on TtW (identical for fixed-row fuels).
    const cInt = pathwayFuel && !wtw ? candChemical : candInt;
    const candidateParts: EmissionParts = {
      wttTco2e: (wtw ? cInt.wtt : 0) * candidateEnergyMj * g2t,
      ttwCo2Tco2e: cInt.ttwCo2 * candidateEnergyMj * g2t,
      ttwCh4Tco2e: cInt.ttwCh4 * candidateEnergyMj * g2t,
      ttwN2oTco2e: cInt.ttwN2o * candidateEnergyMj * g2t,
      n2oSlipTco2e: slipPerMj * candidateEnergyMj * g2t,
      pilotTco2e: pilotInt ? intensityOf(pilotInt) * pilotEnergyMj * g2t : 0,
    };
    const sum = (p: EmissionParts) =>
      p.wttTco2e + p.ttwCo2Tco2e + p.ttwCh4Tco2e + p.ttwN2oTco2e + p.n2oSlipTco2e + p.pilotTco2e;

    const baselineEmissions = sum(baselineParts);
    const candidateEmissions = sum(candidateParts);
    const avoided = baselineEmissions - candidateEmissions;
    return {
      baseline: {
        energyMj: baselineEnergyMj,
        intensityGco2ePerMj: intensityOf(baseInt),
        emissionsTco2e: baselineEmissions,
        parts: baselineParts,
      },
      candidate: {
        energyMj: candidateEnergyMj,
        intensityGco2ePerMj:
          intensityOf(pathwayFuel && !wtw ? candChemical : candInt) + slipPerMj,
        emissionsTco2e: candidateEmissions,
        parts: candidateParts,
      },
      avoidedTco2e: avoided,
      reductionPercent: baselineEmissions === 0 ? 0 : (avoided / baselineEmissions) * 100,
      blendIntensityGco2ePerMj:
        totalEnergyMj === 0 ? 0 : (candidateEmissions / totalEnergyMj) * 1e6,
      pilotSplit: (() => {
        const wttPart =
          pilotInt && wtw ? pilotInt.wtt * pilotEnergyMj * g2t : 0;
        return { wttTco2e: wttPart, ttwTco2e: candidateParts.pilotTco2e - wttPart };
      })(),
    };
  };

  const wellToWake = basisResult("wellToWake");
  const tankToWake = basisResult("tankToWake");

  // --- what the ETS actually charges for ---------------------------------
  // Built from the TtW parts rather than recomputed, so the two can never
  // drift: the only difference is the fossil share applied to the CO2 term.
  //
  // An UNCLASSIFIED row defaults to 1 — fully chargeable. A green fuel left
  // unclassified is then over-charged, which is visible; defaulting to 0
  // would silently under-charge a fossil row, which is not.
  //
  // For a pathway fuel on the TtW basis the parts carry `candChemical`, so
  // the CO2 term here is the real stack carbon (e-methanol's 69.1 gCO2/MJ)
  // before the share is applied — not the certified WtW value.
  const etsFossilShare = candidate.fossilCarbonShare ?? 1;
  const ttwParts = tankToWake.candidate.parts;
  const etsCo2 = ttwParts.ttwCo2Tco2e * etsFossilShare;
  const etsNonCo2 = ttwParts.ttwCh4Tco2e + ttwParts.ttwN2oTco2e + ttwParts.n2oSlipTco2e;
  // Gas MASS per tonne of fuel, recovered by dividing the CO2e terms back
  // out by their GWPs — so the two can never disagree about the slip or the
  // GWP set, which two independent calculations eventually would.
  const candTonnes = candidateMassTonnes || 1;
  const etsChargeable: EtsChargeable = {
    co2Tco2e: etsCo2,
    nonCo2Tco2e: etsNonCo2,
    pilotTco2e: ttwParts.pilotTco2e,
    totalTco2e: etsCo2 + etsNonCo2 + ttwParts.pilotTco2e,
    fossilCarbonShare: etsFossilShare,
    ch4TPerTonneFuel: gwp.ch4 > 0 ? ttwParts.ttwCh4Tco2e / gwp.ch4 / candTonnes : 0,
    // The two N2O terms are divided by their OWN GWPs and only then summed:
    // `n2oSlipGwpOverride` lets the slip carry a different GWP from the row's
    // combustion N2O, so dividing the sum by one of them would corrupt the
    // mass exactly when the override is in use.
    n2oTPerTonneFuel:
      ((gwp.n2o > 0 ? ttwParts.ttwN2oTco2e / gwp.n2o : 0) +
        (slipGwp > 0 ? ttwParts.n2oSlipTco2e / slipGwp : 0)) /
      candTonnes,
    gwpCh4: gwp.ch4,
    gwpN2o: gwp.n2o,
  };

  const imo = ds.frameworks["imo"];
  const znzTo2034 = imo?.znzThresholdGco2ePerMj?.to2034 ?? 19.0;
  const znzFrom2035 = imo?.znzThresholdGco2ePerMj?.from2035 ?? 14.0;
  const blendWtw = wellToWake.blendIntensityGco2ePerMj;
  // ZNZ eligibility is a property of the FUEL/energy source itself: its
  // well-to-wake GHG intensity (incl. its own combustion terms and the
  // N2O slip, excl. pilot fuel) — NOT the ship's attained blended GFI.
  // MEPC 83 approved text; IMO Net-Zero Framework FAQ: "ZNZs have a GHG
  // Fuel Intensity (GFI) of no more than 19.0 gCO2eq/MJ". The blend
  // (attained-GFI analogue) is reported separately.
  const fuelWtw = wellToWake.candidate.intensityGco2ePerMj;

  return {
    datasetVersion: ds.datasetVersion,
    frameworkId: input.frameworkId,
    gwpSetId,
    candidateEnergyMj,
    candidateMassTonnes,
    pilotEnergyMj,
    totalEnergyMj,
    baselineEnergyMj,
    equivalentBaselineMassTonnes,
    baselineLabel: baseResolved.label,
    substitutedFactors,
    wellToWake,
    tankToWake,
    znz: {
      fuelWtwGco2ePerMj: fuelWtw,
      blendWtwGco2ePerMj: blendWtw,
      thresholdTo2034: znzTo2034,
      thresholdFrom2035: znzFrom2035,
      compliantTo2034: fuelWtw <= znzTo2034,
      compliantFrom2035: fuelWtw <= znzFrom2035,
    },
    etsChargeable,
    references: {
      imoGfi2008: imo?.referenceGfi2008 ?? 93.3,
      fuelEuBaseline: FUELEU_BASELINE_GCO2E_PER_MJ,
    },
  };
}

/** A fuel's standalone intensity (F2/F5): TtW and WtW gCO2e/MJ. */
export function fuelIntensity(
  ds: FuelEmissionsRefDataset,
  fuelId: string,
  gwpSetId: string,
): { ttwGco2ePerMj: number; wtwGco2ePerMj: number } | NotParameterised {
  const fuel = getFuel(ds, fuelId);
  const missing = missingParameters(fuel);
  if (missing.length > 0) {
    return { notParameterised: true, fuelId, missing, reviewNote: fuel.reviewNote };
  }
  const i = rowIntensity(fuel, getGwpSet(ds, gwpSetId));
  const ttw = i.ttwCo2 + i.ttwCh4 + i.ttwN2o;
  return { ttwGco2ePerMj: ttw, wtwGco2ePerMj: ttw + i.wtt };
}
