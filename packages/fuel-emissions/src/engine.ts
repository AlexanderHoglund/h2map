/**
 * Pure fuel-emissions evaluator. The functional unit is ENERGY DELIVERED
 * ON BOARD (MJ): a tonne of green fuel does not replace a tonne of fossil
 * fuel (e-ammonia at 18,600 MJ/t replaces ~453.7 t of VLSFO per 1,000 t,
 * not 1,000 t — golden fixture F1 exists to catch the tonne-for-tonne
 * trap, which overstates avoided emissions 2.2×).
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
import { getFramework, getFuel, getGwpSet, missingParameters } from "./ref";

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
  /** Framework id ("fueleu" | "imo"); selects factors AND the GWP set. */
  frameworkId: string;
  /** Sensitivity only — still exactly one set per evaluation. */
  gwpSetOverride?: string;
  /**
   * Certified pathway WtW intensity for pathway-dependent fuels
   * (e-ammonia): REQUIRED for fuels whose WtT is a range, ignored for
   * fixed-row fuels. Never defaulted — a zero-WtW fuel is an assumption,
   * not a certifiable value.
   */
  candidateWtwGco2ePerMj?: number;
  /** Share of TOTAL delivered energy burned as fossil pilot (0–1). */
  pilotShare?: number;
  pilotFuelId?: string;
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
}

export interface NotParameterised {
  notParameterised: true;
  fuelId: string;
  missing: string[];
  /** The dataset's own review note, verbatim, for the UI. */
  reviewNote?: string;
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
  wellToWake: BasisResult;
  tankToWake: BasisResult;
  znz: {
    blendWtwGco2ePerMj: number;
    thresholdTo2034: number;
    thresholdFrom2035: number;
    compliantTo2034: boolean;
    compliantFrom2035: boolean;
  };
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

/** Per-MJ intensity components of a FIXED-row fuel under one GWP set. */
function rowIntensity(
  fuel: RefFuel,
  gwp: { ch4: number; n2o: number },
): Intensity {
  const lcv = fuel.lcvMjPerG;
  const n2o = typeof fuel.ttw.n2oGPerG === "number" ? fuel.ttw.n2oGPerG : 0;
  return {
    wtt: fuel.wttGco2ePerMj ?? 0,
    ttwCo2: (fuel.ttw.co2GPerG ?? 0) / lcv,
    ttwCh4: ((fuel.ttw.ch4GPerG ?? 0) * gwp.ch4) / lcv,
    ttwN2o: (n2o * gwp.n2o) / lcv,
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
  const pathwayFuel = candidate.wttGco2ePerMj === null && !!candidate.wttRangeGco2ePerMj;
  for (const [fuel, role] of [
    [candidate, "candidate"],
    [baseline, "baseline"],
  ] as const) {
    const missing = missingParameters(fuel).filter(
      // A pathway WtT range is satisfiable by the certified-value input.
      (m) => !(fuel.id === candidate.id && pathwayFuel && m === "wttGco2ePerMj"),
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

  // --- intensities under the ONE selected GWP set ------------------------
  const baseInt = rowIntensity(baseline, gwp);
  // Pathway fuels (certified E-value): the WtW basis uses the certified
  // value as the WHOLE pathway intensity — for e-methanol the certificate
  // resolves whether the combustion carbon counts (DAC vs point-source).
  // The TANK-TO-WAKE basis stays chemical: the row's stack factors (zero
  // for e-ammonia by chemistry, 69.1 gCO2/MJ for e-methanol — a carbon
  // molecule regardless of accounting).
  const candChemical = rowIntensity(candidate, gwp);
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
  const pilotInt = pilot ? rowIntensity(pilot, gwp) : null;

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
    };
  };

  const wellToWake = basisResult("wellToWake");
  const tankToWake = basisResult("tankToWake");

  const imo = ds.frameworks["imo"];
  const znzTo2034 = imo?.znzThresholdGco2ePerMj?.to2034 ?? 19.0;
  const znzFrom2035 = imo?.znzThresholdGco2ePerMj?.from2035 ?? 14.0;
  const blendWtw = wellToWake.blendIntensityGco2ePerMj;

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
    wellToWake,
    tankToWake,
    znz: {
      blendWtwGco2ePerMj: blendWtw,
      thresholdTo2034: znzTo2034,
      thresholdFrom2035: znzFrom2035,
      compliantTo2034: blendWtw <= znzTo2034,
      compliantFrom2035: blendWtw <= znzFrom2035,
    },
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
