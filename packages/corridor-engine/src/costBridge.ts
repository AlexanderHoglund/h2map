/**
 * The MMMCZCS cost bridge, decomposed into named blocks.
 *
 * The waterfall used to be assembled inside the React component, which meant
 * the arithmetic that closes it could not be tested. That was tolerable while
 * there was one float. It is not once regulation is split per instrument: the
 * renderer was hand-subtracting the financing line back out of
 * `netRegulatoryEffectUsdM` so the two floats would not double-count, and
 * NOTHING verified that subtraction. This module owns that arithmetic instead,
 * as pure data, so `costBridgeClosure` can assert it.
 *
 * THE INVARIANT, and the whole point of this file:
 *
 *     gross + Σ every block delta === summary.gapPvUsdM
 *
 * to within floating-point noise. Every block is a difference of PVs the
 * engine already computed, so this is a re-grouping rather than a
 * re-derivation — but NOT a bit-identical one: the engine sums each side's
 * per-year rows and then differences the totals, while this sums per-instrument
 * differences. Same arithmetic, different association order, so the last
 * one or two ULPs move. Measured across every shipped scenario the residual
 * is ≤ 1e-15 RELATIVE (~5e-13 absolute on a ~$1,800m gap).
 *
 * The test therefore pins a relative tolerance, and a tight one: anything
 * above ~1e-9 is not rounding, it is a block drawn on the chart but missing
 * from the sum — exactly the mistake the old hand-subtraction invited — and
 * the waterfall would be misattributing the gap.
 *
 * THREE STOPPING POINTS, because "what does this cost?" has three different
 * honest answers depending on which policies you accept as real:
 *
 *   grossIncremental  green − fossil, plus only regulation that is IN FORCE
 *                     today. The law as it stands.
 *   netIncremental    + instruments still being TESTED (IMO NZF pending
 *                     adoption; self-designed, which is user-invented).
 *                     Equals the engine's headline gap.
 *   valueChain        + commercial allocation — who actually pays what is
 *                     left. Not part of this module: those quantities do not
 *                     exist in the engine yet, and must never enter
 *                     `totalPvUsdM`, or the model would report a smaller gap
 *                     because somebody agreed to pay.
 *
 * The in-force/tested split is a CLASSIFICATION, not a value judgement, and it
 * is data rather than a hardcoded list in the renderer — see `REGULATION_STATUS`.
 */

import type { ScenarioResult } from "@h2map/corridor-schema";

/** Where a block falls relative to the three stopping points. */
export type BridgeStop = "grossIncremental" | "netIncremental" | "valueChain";

/**
 * Whether an instrument is law today or a policy being tested.
 *
 * Sourced from each module's own documented status, NOT from a preference
 * about which policies ought to count:
 *
 *  - `ets`      EU ETS — maritime scope phasing in since 2024.
 *  - `fuelEu`   FuelEU Maritime — in application from 2025.
 *  - `ira45z`   IRA §45Z — legislated; the model already carries its sunset.
 *  - `imoNetZero` draft MEPC 83. The reference bundle's own sourceNote says
 *                 "PROVISIONAL pending adoption, targeted MEPC 85, Oct 2026".
 *                 Moving it to in-force after adoption is a change HERE, one
 *                 line, rather than anywhere in the renderer.
 *  - `selfDesigned` user-invented by construction, and it carries the four
 *                 grant/support levers, so it is never "in force".
 */
export const REGULATION_STATUS = {
  ets: "inForce",
  fuelEu: "inForce",
  ira45z: "inForce",
  imoNetZero: "tested",
  selfDesigned: "tested",
} as const satisfies Record<string, "inForce" | "tested">;

export type RegulationKey = keyof typeof REGULATION_STATUS;

/** One waterfall block: a signed change in the gap, with its provenance. */
export interface BridgeBlock {
  /** Stable id — also the i18n key suffix and the React key. */
  readonly key: RegulationKey | "financing";
  /** Signed effect on the gap, $m PV. Negative narrows it. */
  readonly deltaUsdM: number;
  /** Which stop this block lands before. */
  readonly stop: Exclude<BridgeStop, "valueChain">;
}

export interface CostBridge {
  /** Anchored: green CAPEX+OPEX PV, the leftmost bar. */
  readonly greenTotalUsdM: number;
  /** Anchored: fossil CAPEX+OPEX PV, hanging to the gross level. */
  readonly fossilTotalUsdM: number;
  /** green − fossil, before ANY regulation. */
  readonly grossUsdM: number;
  /** Every non-zero block, in display order. */
  readonly blocks: readonly BridgeBlock[];
  /** Running totals at each stop. */
  readonly stops: {
    /** gross + in-force regulation. */
    readonly grossIncrementalUsdM: number;
    /** + tested instruments + financing. Equals `summary.gapPvUsdM`. */
    readonly netIncrementalUsdM: number;
  };
}

/**
 * Build the bridge from an evaluated scenario.
 *
 * Blocks that come out at exactly zero are DROPPED. With six instruments most
 * scenarios have several inactive, and a row of zero-height bars makes the
 * chart unreadable while implying the instrument was modelled and found
 * negligible — which is a different claim from "not applicable here".
 */
export function buildCostBridge(result: ScenarioResult): CostBridge {
  const s = result.summary;
  const rep = result.reporting;

  const greenTotalUsdM = s.greenCapexPvUsdM + s.greenOpexPvUsdM;
  const fossilTotalUsdM = s.fossilCapexPvUsdM + s.fossilOpexPvUsdM;
  const grossUsdM = rep.gapPvPreRegulationUsdM; // === green − fossil

  // Each instrument's effect on the GAP is its green cost minus its fossil
  // cost. 45Z and financing are green-side only, so they stand alone.
  const imo = rep.imoNetZero;
  const imoDelta =
    imo && !("notParameterised" in imo && imo.notParameterised)
      ? imo.green.pvUsdM - imo.fossil.pvUsdM
      : 0;

  const candidates: readonly BridgeBlock[] = [
    {
      key: "ets",
      deltaUsdM: s.etsGreenPvUsdM - s.etsFossilPvUsdM,
      stop: "grossIncremental",
    },
    {
      key: "fuelEu",
      deltaUsdM: s.fuelEuGreenPvUsdM - s.fuelEuFossilPvUsdM,
      stop: "grossIncremental",
    },
    { key: "ira45z", deltaUsdM: s.ira45zGreenPvUsdM, stop: "grossIncremental" },
    { key: "imoNetZero", deltaUsdM: imoDelta, stop: "netIncremental" },
    {
      key: "selfDesigned",
      deltaUsdM: s.selfDesignedGreenPvUsdM - s.selfDesignedFossilPvUsdM,
      stop: "netIncremental",
    },
    // Financing is NOT regulation — it is an interest saving actually paid,
    // and it defaults off. It sits at the netIncremental stop because that is
    // where the engine's headline gap already counts it: `gapPvUsdM` includes
    // the financing line, so excluding it here would break the closure.
    {
      key: "financing",
      deltaUsdM: s.financingGreenPvUsdM ?? 0,
      stop: "netIncremental",
    },
  ];

  const blocks = candidates.filter((b) => b.deltaUsdM !== 0);

  const sumTo = (stop: BridgeBlock["stop"]) =>
    candidates
      .filter((b) => b.stop === stop)
      .reduce((acc, b) => acc + b.deltaUsdM, 0);

  const grossIncrementalUsdM = grossUsdM + sumTo("grossIncremental");

  return {
    greenTotalUsdM,
    fossilTotalUsdM,
    grossUsdM,
    blocks,
    stops: {
      grossIncrementalUsdM,
      netIncrementalUsdM: grossIncrementalUsdM + sumTo("netIncremental"),
    },
  };
}

/**
 * The closure residual: what the bridge fails to explain, in $m.
 *
 * Near-zero means every dollar between the gross gap and the headline is
 * attributed to a named block. Exposed rather than asserted internally so a
 * test can pin it and the UI could surface a warning if it ever drifts.
 *
 * Expect ~1e-13 absolute, i.e. ≤1e-15 relative: association order differs
 * from the engine's (see the file header). Compare RELATIVE to the gap, not
 * absolute — an absolute threshold that suits a $1,800m corridor is
 * meaningless on a $200m one.
 */
export function costBridgeClosure(result: ScenarioResult): number {
  return buildCostBridge(result).stops.netIncrementalUsdM - result.summary.gapPvUsdM;
}
