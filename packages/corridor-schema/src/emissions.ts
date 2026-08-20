/**
 * Refined emission-factor derivation (schema v6) — THE replacement for the
 * workbook's flat per-fuel scalars. Factors are computed live from the
 * @h2map/fuel-emissions reference dataset under ONE selected accounting
 * framework (FuelEU Maritime by default, IMO Net-Zero switchable), instead
 * of being transcribed Excel cells:
 *
 * - Green (candidate) side: certified pathway WtT (never zero — the
 *   dataset's per-fuel reference prefill applies when the scenario carries
 *   none) + N2O slip scenario + fossil pilot share, expressed as the BLEND
 *   WtW intensity over total delivered energy (the attained-GFI analogue;
 *   e-ammonia ≈ 22.14 gCO2e/MJ under FuelEU/AR4 at the defaults). The
 *   combustion EF is the TtW CO2e per tonne of green fuel incl. slip and
 *   pilot combustion. Approximation, documented: the pilot's ENERGY is not
 *   added to the corridor's tonnage bookkeeping — its emissions ride the
 *   green fuel's factors.
 * - Fossil (baseline) side: framework-resolved WtT (Annex II row under
 *   FuelEU; MEPC.391(81) sulphur band under IMO) + Annex II TtW stack.
 *
 * Derivation returns null when the refined method cannot honestly price the
 * fuel under the selected framework (e.g. LNG as a baseline — per-engine
 * slip is a candidate-side input; LNG under IMO — no upstream default): the
 * resolver then FALLS BACK to the bundle's legacy scalar with a disclosed
 * "legacy factor" provenance, never a silent zero.
 *
 * Both frameworks are always derived when possible (`wtwByFramework`), so
 * the FuelEU compliance module and the IMO GFI module can each price with
 * their OWN accounting regardless of the selected display framework.
 */

import {
  evaluateFuelEmissions,
  parseRefDataset,
  type FuelEmissionsRefDataset,
  type FuelEmissionsResult,
} from "@h2map/fuel-emissions";
import feSeedJson from "../../../data/fuel-emissions-ref/2026-08-17-ets-carbon-4.json";
import type { FuelEmissionsSideInput } from "./scenario";
import type { RefBundle } from "./ref/bundle";

/** The dataset this build of the schema derives from (bundle-pin checked). */
export const FUEL_EMISSIONS_DATASET: FuelEmissionsRefDataset =
  parseRefDataset(feSeedJson);

export type EmissionsFramework = "fueleu" | "imo";

export interface DerivedFuelFactors {
  wtwGco2PerMj: number;
  /** Both frameworks where derivable — each module prices with its own. */
  wtwByFramework: { fueleu?: number; imo?: number };
  combustionEfTco2PerTonne: number;
  /**
   * The ETS-CHARGEABLE combustion CO2 per tonne, which is NOT
   * `combustionEfTco2PerTonne` for a certified biogenic or RFNBO fuel.
   *
   * The Directive zero-rates captured carbon, so e-methanol's real 1.4550
   * tCO2/t stack factor is chargeable only for its fossil pilot (0.0800).
   * Kept as a SEPARATE field rather than netted into `combustionEf`, which
   * FuelEU, the IMO GFI and the abatement delta all read — netting there
   * would move four consumers to fix one.
   *
   * CO2 ONLY. CH4 and N2O are charged from 2026 regardless of carbon origin
   * and reach the ETS module through its own `gasCoverage` block; folding
   * them in here would double-count them.
   */
  etsChargeableEfTco2PerTonne: number;
  /**
   * Non-CO2 combustion gases, tonnes of GAS per tonne of fuel — the ETS
   * `gasCoverage` factors, derived rather than typed.
   *
   * These are per-framework and per-engine facts, not preferences: methane
   * slip on a dual-fuel medium-speed Otto engine is 3.1% under FuelEU and
   * 3.5% under IMO, so a typed value silently contradicts the framework
   * selector above it. `ch4` here INCLUDES engine slip, which for LNG is the
   * dominant term.
   *
   * Mass of gas, NOT CO2e: the GWPs are applied by the ETS module, which
   * pairs them with the framework's own GWP set.
   */
  ch4TPerTonne: number;
  n2oTPerTonne: number;
  /** The framework's GWP set (AR4 for FuelEU, AR5 for IMO). */
  gwpCh4: number;
  gwpN2o: number;
  lhvMjPerTonne: number;
  /** Provenance line for the UI/exports. */
  derivation: string;
}

export function deriveFuelFactors(args: {
  bundle: RefBundle;
  corridorFuelId: string;
  side: "green" | "fossil";
  framework: EmissionsFramework;
  em: FuelEmissionsSideInput | null | undefined;
  /** Test seam; defaults to the build's dataset. */
  ds?: FuelEmissionsRefDataset;
}): DerivedFuelFactors | null {
  const { bundle, corridorFuelId, side, framework, em } = args;
  const ds = args.ds ?? FUEL_EMISSIONS_DATASET;
  const fe = bundle.fuelEmissions;
  if (!fe) return null;
  if (fe.datasetVersion !== ds.datasetVersion) {
    throw new Error(
      `bundle pins fuel-emissions dataset "${fe.datasetVersion}" but ` +
        `"${ds.datasetVersion}" is loaded`,
    );
  }
  const feId = fe.map[corridorFuelId];
  if (!feId) return null;
  const row = ds.fuels.find((f) => f.id === feId);
  if (!row) return null;

  const perFramework = (
    fw: EmissionsFramework,
  ): {
    wtw: number;
    ef: number;
    etsEf: number;
    ch4: number;
    n2o: number;
    gwpCh4: number;
    gwpN2o: number;
  } | null => {
    if (side === "fossil") {
      // Baseline role: 1,000 t of the fossil fuel, factors read off the
      // baseline side (the candidate is a fixed probe that cannot move
      // baseline outputs — intensities are per-MJ).
      const r = evaluateFuelEmissions(
        {
          candidateFuelId: "e-ammonia",
          quantityTonnes: 1000,
          quantityBasis: "baseline",
          candidateWtwGco2ePerMj: 15,
          baselineFuelId: feId,
          ...(em?.sulphurPercent != null
            ? { baselineSulphurPercent: em.sulphurPercent }
            : {}),
          frameworkId: fw,
          pilotShare: 0,
          n2oSlipGPerG: 0,
          efficiencyRatio: 1,
        },
        ds,
      );
      if ("notParameterised" in r && r.notParameterised) return null;
      const ok = r as FuelEmissionsResult;
      // The BASELINE role reads baseline outputs, and `etsChargeable` is
      // computed for the candidate — so it cannot be reused here. The
      // baseline is a fossil row by construction on this side, so its
      // chargeable CO2 is its combustion CO2 in full; apply the row's own
      // share anyway rather than assuming, so a future bio-baseline (bio-LNG
      // as the incumbent) is priced correctly without a code change.
      const baseParts = ok.tankToWake.baseline.parts;
      const baseRow = ds.fuels.find((f) => f.id === feId);
      return {
        wtw: ok.wellToWake.baseline.intensityGco2ePerMj,
        ef: ok.tankToWake.baseline.emissionsTco2e / 1000,
        etsEf: (baseParts.ttwCo2Tco2e * (baseRow?.fossilCarbonShare ?? 1)) / 1000,
        // Baseline role: 1,000 t of the fossil fuel was evaluated, so the
        // per-tonne mass is the CO2e term over its own GWP over 1,000.
        ch4: ok.etsChargeable.gwpCh4 > 0
          ? baseParts.ttwCh4Tco2e / ok.etsChargeable.gwpCh4 / 1000
          : 0,
        n2o: ok.etsChargeable.gwpN2o > 0
          ? baseParts.ttwN2oTco2e / ok.etsChargeable.gwpN2o / 1000
          : 0,
        gwpCh4: ok.etsChargeable.gwpCh4,
        gwpN2o: ok.etsChargeable.gwpN2o,
      };
    }
    // Candidate role: certified pathway + slip scenario + pilot blend.
    const certified =
      em?.certifiedWttGco2ePerMj ?? row.defaultCertifiedWttGco2ePerMj;
    const isPathway = row.wttGco2ePerMj === null && !!row.wttRangeGco2ePerMj;
    if (isPathway && certified == null) return null;
    const slipScenario =
      feId === "e-ammonia"
        ? (ds.n2oSlip.scenarios.find(
            (s) => s.id === (em?.n2oScenarioId ?? "optimised-injection"),
          ) ?? null)
        : null;
    const r = evaluateFuelEmissions(
      {
        candidateFuelId: feId,
        quantityTonnes: 1000,
        baselineFuelId: "hfo",
        frameworkId: fw,
        ...(certified != null ? { candidateWtwGco2ePerMj: certified } : {}),
        pilotShare: em?.pilotShare ?? ds.pilotFuel.defaultShareOfEnergy,
        pilotFuelId: em?.pilotFuelId ?? ds.pilotFuel.defaultPilotFuelId,
        ...(row.requiresEngineType
          ? { engineType: em?.engineType ?? ds.methaneSlip.byEngine[0]?.engine }
          : {}),
        n2oSlipGPerG: slipScenario?.value ?? 0,
        efficiencyRatio: em?.efficiencyRatio ?? ds.engineEfficiencyRatio.default,
      },
      ds,
    );
    if ("notParameterised" in r && r.notParameterised) return null;
    const ok = r as FuelEmissionsResult;
    return {
      wtw: ok.znz.blendWtwGco2ePerMj,
      ef: ok.tankToWake.candidate.emissionsTco2e / 1000,
      // CO2 + pilot, NOT the non-CO2 terms: CH4/N2O reach the ETS module
      // through its own gasCoverage block, and adding them here would
      // double-count them. The pilot IS included — it is fossil carbon
      // burned in the same engine and chargeable in full.
      etsEf: (ok.etsChargeable.co2Tco2e + ok.etsChargeable.pilotTco2e) / 1000,
      ch4: ok.etsChargeable.ch4TPerTonneFuel,
      n2o: ok.etsChargeable.n2oTPerTonneFuel,
      gwpCh4: ok.etsChargeable.gwpCh4,
      gwpN2o: ok.etsChargeable.gwpN2o,
    };
  };

  const fueleu = perFramework("fueleu");
  const imo = perFramework("imo");
  const selected = framework === "imo" ? imo : fueleu;
  if (!selected) return null;
  return {
    wtwGco2PerMj: selected.wtw,
    wtwByFramework: {
      ...(fueleu ? { fueleu: fueleu.wtw } : {}),
      ...(imo ? { imo: imo.wtw } : {}),
    },
    combustionEfTco2PerTonne: selected.ef,
    etsChargeableEfTco2PerTonne: selected.etsEf,
    ch4TPerTonne: selected.ch4,
    n2oTPerTonne: selected.n2o,
    gwpCh4: selected.gwpCh4,
    gwpN2o: selected.gwpN2o,
    lhvMjPerTonne: row.lcvMjPerG * 1e6,
    // User-facing: the badge shows this after "Derived:". Names the
    // accounting rulebook and the fuel — never the dataset version, which
    // means nothing to a reader (the bundle pin keeps full traceability).
    derivation: `${
      framework === "imo" ? "IMO Net-Zero accounting (AR5)" : "FuelEU Maritime accounting (AR4)"
    } · ${row.name}`,
  };
}
