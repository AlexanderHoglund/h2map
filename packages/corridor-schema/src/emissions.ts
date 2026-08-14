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
import feSeedJson from "../../../data/fuel-emissions-ref/2026-08-14-seed-3.json";
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

  const perFramework = (fw: EmissionsFramework): { wtw: number; ef: number } | null => {
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
      return {
        wtw: ok.wellToWake.baseline.intensityGco2ePerMj,
        ef: ok.tankToWake.baseline.emissionsTco2e / 1000,
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
    lhvMjPerTonne: row.lcvMjPerG * 1e6,
    derivation:
      `derived from fuel-emissions ${ds.datasetVersion} · ` +
      `${framework === "imo" ? "IMO Net-Zero (AR5)" : "FuelEU Maritime (AR4)"} · ${row.name}`,
  };
}
