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
import { buildReporting } from "./reporting";

/**
 * Version pinned into saved scenarios (scenarios.engine_version). Bump on any
 * behavior change so stored results can be flagged for recompute.
 */
// 0.2.0 — the emission-method replacement: factors derive from the
// fuel-emissions dataset (schema v6) and the FuelEU/IMO modules price
// with their own framework's intensity when both are available.
export const CORRIDOR_ENGINE_VERSION = "0.2.0";

export { evaluateSide } from "./side";
export { buildReporting } from "./reporting";
export { buildCostBridge, costBridgeClosure, REGULATION_STATUS } from "./costBridge";
export type { BridgeBlock, BridgeStop, CostBridge, RegulationKey } from "./costBridge";
export { buildTimeline } from "./timeline";
export { discountFactor, inflationFactor } from "./rates";
export { stepValue } from "./schedule";
export { etsCostUsdM } from "./regulation/ets";
export { fuelEuCostUsdM } from "./regulation/fuelEu";
export { ira45zCreditUsdM } from "./regulation/ira45z";
export { selfDesignedCostUsdM } from "./regulation/selfDesigned";
export {
  capitalRecoveryFactor,
  synthesisScaleFactor,
  synthesize,
  synthesizePlant,
  SCALE_EXTRAPOLATION_LIMIT,
} from "./synthesis";
export type {
  SynthesisBreakdown,
  SynthesisPlantResult,
  SynthesisResult,
} from "./synthesis";
export {
  deliveredUsdPerTonne,
  greatCircleKm,
  logisticsLeg,
  logisticsUsdPerTonne,
} from "./logistics";
export type { LatLon, LogisticsConfig, LogisticsLegResult } from "./logistics";

export function evaluateScenario(resolved: ResolvedScenario): ScenarioResult {
  const ctx: EvalContext = {
    timeline: buildTimeline(resolved.startYear, resolved.horizonYears),
    discounting: { wacc: resolved.wacc.value },
    inflation: resolved.inflation,
    rateBasis: resolved.flags.rateBasis, // D6
    emissionsBasis: resolved.flags.emissionsBasis, // D1 (fix #2: reg modules too)
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

  // DELIVERED-ENERGY PARITY.
  //
  // Abatement above is a MASS comparison: fossil tonnes × EF minus green
  // tonnes × EF. That is only a valid statement about the same transport
  // work when the two tonnages carry the same delivered energy. Under the
  // derived chain they do exactly — both sides solve the same
  // 2 × distance × roundtrips × GJ/nm against their own LHV, so the ratio
  // is 1.000 by construction and this costs nothing.
  //
  // Override ONE side's burn, though, and the comparison silently becomes
  // "this much of fuel A against that much of fuel B", with no shared basis.
  // The shipped Chilean default happens to be energy-matched (5,700/2,638 =
  // 2.1607 against LHV 40,200/18,600 = 2.1613) but nothing enforced it, and
  // the v6→v7 migrated vessel-benchmark scenarios are exactly the population
  // where it can silently fail.
  //
  // DISCLOSE ONLY — never clamp, rescale or block. The user may have good
  // reason to compare unequal work; they should just know they are.
  const greenEnergyMj =
    resolved.vessels *
    greenInputs.fuel.tonnesPerVesselYear *
    greenInputs.fuel.lhv;
  const fossilEnergyMj =
    resolved.vessels *
    fossilInputs.fuel.tonnesPerVesselYear *
    fossilInputs.fuel.lhv;
  // Green ÷ fossil: >1 means the green side delivers MORE energy, so the
  // abated figure flatters the comparison. Guard a zero fossil side rather
  // than reporting Infinity.
  const energyRatio =
    fossilEnergyMj > 0 ? greenEnergyMj / fossilEnergyMj : null;
  const energyDivergence = energyRatio === null ? null : energyRatio - 1;

  // PORT ENERGY SHARE.
  //
  // The catalogue carries port, idle and cargo-system day rates, but a raw
  // GJ/day tells a user nothing about whether their scenario depends on it.
  // The share does, and it is a property of the CORRIDOR rather than the
  // vessel: the same Newcastlemax spends under 1% of round-trip energy in
  // port on a 9,500 nm run and around 10% on a 786 nm one.
  //
  // Every one of these day rates is tier C — sector estimates, the largest
  // unsourced term in the bundle — so the share is exactly the number that
  // says how much that matters here. Reported, never corrected.
  //
  // Absent day rates report NO share rather than a share computed from
  // zero: "unknown" and "negligible" must not look alike.
  const voyage = resolved.voyage;
  const portDayRateGjPerDay =
    voyage === undefined
      ? undefined
      : voyage.portGjPerDay === undefined && voyage.cargoSystemGjPerDay === undefined
        ? undefined
        : (voyage.portGjPerDay ?? 0) + (voyage.cargoSystemGjPerDay ?? 0);
  const portEnergy = (() => {
    if (voyage === undefined || portDayRateGjPerDay === undefined) return null;
    // PORT_DAYS_PER_ROUND_TRIP is a modelling assumption, not catalogue
    // data — one loading and one discharging call per round trip, two days
    // each. It is stated here rather than hidden because the share is
    // linear in it: doubling the port days doubles the share.
    const PORT_DAYS_PER_ROUND_TRIP = 4;
    const steamingGj =
      2 * voyage.oneWayDistanceNm * voyage.wholeVoyageGjPerNm;
    const portGj = PORT_DAYS_PER_ROUND_TRIP * portDayRateGjPerDay;
    const total = steamingGj + portGj;
    return total > 0
      ? {
          portDaysPerRoundTrip: PORT_DAYS_PER_ROUND_TRIP,
          steamingGjPerRoundTrip: steamingGj,
          portGjPerRoundTrip: portGj,
          share: portGj / total,
          /**
           * Past ~10% the tier-C day rates stop being a rounding error and
           * start driving the fuel bill, so the UI escalates the unverified
           * badge to a warning.
           */
          material: portGj / total > 0.1,
        }
      : null;
  })();

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
      // Sprint 4 — only when the financing module produced a line, so the
      // frozen golden summary key set is untouched.
      ...(green.financingPvUsdM !== undefined
        ? { financingGreenPvUsdM: green.financingPvUsdM }
        : {}),
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
    // Port energy share, when the catalogue supplies day rates. Outside
    // `summary` like `energyParity`, so the frozen golden fixture's
    // compared sections are untouched; absent entirely on a bundle without
    // the rates, so "unknown" never renders as "negligible".
    ...(portEnergy ? { portEnergy } : {}),
    // Delivered-energy parity for the abatement comparison. Outside
    // `summary` for the same reason as `reporting` — the golden compares
    // section-wise, so a new top-level block leaves the frozen fixture
    // untouched.
    energyParity: {
      greenMjPerYear: greenEnergyMj,
      fossilMjPerYear: fossilEnergyMj,
      /** green ÷ fossil; 1.000 under the derived chain. Null if fossil is 0. */
      ratio: energyRatio,
      /** Signed fractional divergence from parity (0 = matched). */
      divergence: energyDivergence,
      /**
       * Past ±5%, the abated tonnes compare unequal transport work and the
       * UI raises an amber note. The threshold is a judgement call: small
       * enough to catch a one-sided override, wide enough that rounding in
       * a deliberately energy-matched scenario (the Chilean default sits at
       * 0.03%) does not cry wolf.
       */
      diverged:
        energyDivergence !== null && Math.abs(energyDivergence) > 0.05,
    },
    // Fix #1: pre/post-regulation split. Lives OUTSIDE `summary` — the
    // golden compares summary/intermediates/perYear section-wise, so this
    // block leaves the frozen fixture untouched.
    reporting: {
      ...buildReporting(green, fossil, cargoUnitsLifetime, co2AbatedTonnes),
      // Fix #6 — IMO Net-Zero reporting: tier breakdown + surplus per side,
      // or the explicit not-parameterised marker (never a silent zero).
      ...(resolved.imoNotParameterised
        ? { imoNetZero: { notParameterised: true as const } }
        : green.imoNetZero && fossil.imoNetZero
          ? { imoNetZero: { green: green.imoNetZero, fossil: fossil.imoNetZero } }
          : {}),
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
export { resolveFirming } from "./firming";
export type {
  FirmingInputs,
  FirmingOption,
  FirmingResult,
  FirmingStrategy,
} from "./firming";
export { BAND_DRIVERS, computeBand } from "./band";
export type {
  BandContribution,
  BandDriver,
  BandDriverKey,
  BandResult,
  BandSample,
} from "./band";
