/**
 * Green Corridor engine — pure scenario evaluation.
 *
 * `evaluateScenario(resolved)`: builds the timeline, runs the SAME
 * `evaluateSide` for green and fossil, and assembles the summary
 * (Calculation rows 64–85 + Output unit metrics). No I/O, no clock, no
 * randomness — enforced by the package's eslint boundary.
 */

import type {
  EvalContext,
  ResolvedScenario,
  ScenarioResult,
} from "@h2map/corridor-schema";
import { toSideInputs } from "@h2map/corridor-schema";
import { buildTimeline } from "./timeline";
import { evaluateSide } from "./side";

/**
 * Version pinned into saved scenarios (scenarios.engine_version). Bump on any
 * behavior change so stored results can be flagged for recompute.
 */
export const CORRIDOR_ENGINE_VERSION = "0.1.0";

export { evaluateSide } from "./side";
export { buildTimeline } from "./timeline";
export { discountFactor, inflationFactor } from "./rates";
export { stepValue } from "./schedule";
export { etsCostUsdM } from "./regulation/ets";
export { fuelEuCostUsdM } from "./regulation/fuelEu";
export { ira45zCreditUsdM } from "./regulation/ira45z";
export { selfDesignedCostUsdM } from "./regulation/selfDesigned";

export function evaluateScenario(resolved: ResolvedScenario): ScenarioResult {
  const ctx: EvalContext = {
    timeline: buildTimeline(resolved.startYear, resolved.horizonYears),
    discounting: { wacc: resolved.wacc.value },
    inflation: resolved.inflation,
    rateBasis: resolved.flags.rateBasis, // D6
  };

  const greenInputs = toSideInputs(resolved, "green");
  const fossilInputs = toSideInputs(resolved, "fossil");
  const green = evaluateSide(greenInputs, ctx);
  const fossil = evaluateSide(fossilInputs, ctx);

  // Row 65: CO2 abated on combustion (TTW) factors — fossil tonnes × fossil
  // EF minus green tonnes × green EF, per modeled year (the Excel basis).
  const combustionPerYearT =
    resolved.vessels *
      fossilInputs.fuel.tonnesPerVesselYear *
      fossilInputs.fuel.combustionEf -
    resolved.vessels *
      greenInputs.fuel.tonnesPerVesselYear *
      greenInputs.fuel.combustionEf;
  // D1 — well-to-wake basis: tonnes × LHV [MJ/t] × WTW [gCO2e/MJ] / 1e6 → t.
  const wtwPerYearT =
    (resolved.vessels *
      fossilInputs.fuel.tonnesPerVesselYear *
      fossilInputs.fuel.lhv *
      fossilInputs.fuel.wtw -
      resolved.vessels *
        greenInputs.fuel.tonnesPerVesselYear *
        greenInputs.fuel.lhv *
        greenInputs.fuel.wtw) /
    1e6;

  const wellToWake = resolved.flags.emissionsBasis === "wellToWake";
  const basisPerYearT = wellToWake ? wtwPerYearT : combustionPerYearT;
  const co2PerYear = ctx.timeline.years.map(() => basisPerYearT);
  const co2AbatedTonnes = co2PerYear.reduce((a, b) => a + b, 0); // row 81

  // Row 80: lifetime cargo = Σ annual throughput — cargo only, no fuel linkage.
  const cargoUnitsLifetime = resolved.unitsPerYear * resolved.horizonYears;

  const gapPvUsdM = green.totalPvUsdM - fossil.totalPvUsdM; // row 79

  return {
    summary: {
      greenTotalPvUsdM: green.totalPvUsdM,
      fossilTotalPvUsdM: fossil.totalPvUsdM,
      gapPvUsdM,
      etsGreenPvUsdM: green.etsPvUsdM,
      fuelEuGreenPvUsdM: green.fuelEuPvUsdM,
      ira45zGreenPvUsdM: green.ira45zPvUsdM,
      selfDesignedGreenPvUsdM: green.selfDesignedPvUsdM,
      etsFossilPvUsdM: fossil.etsPvUsdM,
      fuelEuFossilPvUsdM: fossil.fuelEuPvUsdM,
      selfDesignedFossilPvUsdM: fossil.selfDesignedPvUsdM,
      cargoUnitsLifetime,
      co2AbatedTonnes,
      greenCapexPvUsdM: green.capexPvUsdM,
      greenOpexPvUsdM: green.opexPvUsdM,
      fossilCapexPvUsdM: fossil.capexPvUsdM,
      fossilOpexPvUsdM: fossil.opexPvUsdM,
      // Output!D26/D31 — the ×1e6 converts $m to $ explicitly.
      costPerUnitUsd: (gapPvUsdM * 1e6) / cargoUnitsLifetime,
      costPerTonneCo2Usd: (gapPvUsdM * 1e6) / co2AbatedTonnes,
    },
    intermediates: {
      greenFuelTonnesPerVesselYear: resolved.green.tonnesPerVesselYear.value,
      fossilFuelTonnesPerVesselYear: resolved.fossil.tonnesPerVesselYear.value,
      greenVesselCapexUsdM: resolved.green.vesselCapexUsdM.value,
    },
    perYear: {
      green: green.perYear,
      fossil: fossil.perYear,
      co2AbatedTonnes: co2PerYear,
    },
    // D1 — surface BOTH bases when the non-default one is active (the two
    // differ materially: WTW includes upstream emissions). Absent under Excel
    // defaults so the frozen golden shape is untouched.
    ...(wellToWake
      ? {
          divergences: {
            emissionsBasis: {
              basis: "wellToWake" as const,
              co2AbatedTonnesCombustion: combustionPerYearT * resolved.horizonYears,
              co2AbatedTonnesWellToWake: wtwPerYearT * resolved.horizonYears,
            },
          },
        }
      : {}),
  };
}
