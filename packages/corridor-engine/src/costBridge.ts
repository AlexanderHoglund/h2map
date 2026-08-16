/**
 * The MMMCZCS cost bridge, decomposed into named blocks.
 *
 * The waterfall used to be assembled inside the React component, which meant
 * the arithmetic that closes it could not be tested. That was tolerable while
 * there was one float. It is not once more blocks appear: the renderer was
 * hand-subtracting the financing line back out of `netRegulatoryEffectUsdM`
 * so the two floats would not double-count, and NOTHING verified that
 * subtraction. This module owns that arithmetic instead, as pure data, so
 * `costBridgeClosure` can assert it.
 *
 * THE INVARIANT, and the whole point of this file:
 *
 *     gross + Σ every block delta === summary.gapPvUsdM
 *
 * to within floating-point noise. Every block is a difference of PVs the
 * engine already computed, so this is a re-grouping rather than a
 * re-derivation — but NOT a bit-identical one: the engine sums each side's
 * per-year rows and then differences the totals, while this sums
 * per-instrument differences. Same arithmetic, different association order,
 * so the last one or two ULPs move. Measured across every shipped scenario
 * the residual is ≤ 1e-15 RELATIVE (~5e-13 absolute on a ~$1,800m gap).
 *
 * The test therefore pins a relative tolerance, and a tight one: anything
 * above ~1e-9 is not rounding, it is a block drawn on the chart but missing
 * from the sum — exactly the mistake the old hand-subtraction invited — and
 * the waterfall would be misattributing the gap.
 *
 * TWO BRIDGES, because the figure this reproduces contains two economically
 * different questions and only the first is a cost:
 *
 *   COST      green − fossil, then regulation, then financing, landing on
 *             the incremental cost. What the corridor COSTS.
 *   FUNDING   that incremental cost split across who pays it: the cargo
 *             owner's willingness to pay, and public support as whatever
 *             remains. What the corridor NEEDS.
 *
 * The funding side deliberately does NOT feed `totalPvUsdM`. A customer
 * agreeing to pay does not make the corridor cheaper to run, and a model
 * that reported a smaller gap because someone volunteered money would be
 * conflating cost with funding.
 */

import type { ScenarioResult } from "@h2map/corridor-schema";

/** Which bar a block belongs to. */
export type BridgeStop = "regulation" | "financing" | "funding";

/**
 * The regulatory instruments, in display order.
 *
 * They are drawn as ONE bar. An earlier revision split them by whether each
 * is law today or still provisional; that distinction is real, but it is not
 * what this chart is for, and it produced two thin bars where a reader wants
 * one answer to "what does regulation do to this corridor". The
 * per-instrument detail survives on `parts` for the tooltip, and in the
 * decomposition table below the chart.
 */
export const REGULATION_KEYS = [
  "ets",
  "fuelEu",
  "ira45z",
  "imoNetZero",
  "selfDesigned",
] as const;

export type RegulationKey = (typeof REGULATION_KEYS)[number];

/** One instrument's contribution — a part of a drawn bar, not a bar itself. */
export interface BridgeBlock {
  /** Stable id — also the i18n key suffix. */
  readonly key: RegulationKey | "financing";
  /** Signed effect on the gap, $m PV. Negative narrows it. */
  readonly deltaUsdM: number;
  readonly stop: Extract<BridgeStop, "regulation" | "financing">;
}

/** One drawn bar: its instruments summed, with the parts kept. */
export interface BridgeGroup {
  readonly key: Extract<BridgeStop, "regulation" | "financing">;
  /** Signed effect on the gap, $m PV — the sum of `parts`. */
  readonly deltaUsdM: number;
  /** The instruments inside, INCLUDING inactive ones worth zero. */
  readonly parts: readonly BridgeBlock[];
}

/**
 * Who pays the incremental cost. Not a cost — an allocation of one.
 *
 * `publicSupportUsdM` is the RESIDUAL and is never entered: it is whatever
 * the cargo owner does not cover. That is what makes the bar honest — it
 * always balances, and it answers "how big is the funding gap?" rather than
 * asserting an answer to it.
 */
export interface FundingBridge {
  /** The cost being funded — the headline gap. */
  readonly incrementalUsdM: number;
  /** WTP × abated tonnes, $m. */
  readonly cargoOwnerUsdM: number;
  /** The remainder. NEGATIVE means over-funded — reported, never clamped. */
  readonly publicSupportUsdM: number;
  /** The rate behind `cargoOwnerUsdM`, echoed for labelling. */
  readonly willingnessToPayUsdPerTonneCo2: number;
}

export interface CostBridge {
  /** Anchored: green CAPEX+OPEX PV, the leftmost bar. */
  readonly greenTotalUsdM: number;
  /** Anchored: fossil CAPEX+OPEX PV, hanging to the gross level. */
  readonly fossilTotalUsdM: number;
  /** green − fossil, before ANY regulation. */
  readonly grossUsdM: number;
  /** Every instrument block. Zero-valued ones included. */
  readonly blocks: readonly BridgeBlock[];
  /** What the chart draws: regulation, then financing. */
  readonly groups: readonly BridgeGroup[];
  /** The headline gap — where the cost bridge lands. */
  readonly incrementalUsdM: number;
  /**
   * The funding split. Present only when a willingness to pay is set: with
   * none there is nothing to allocate, and the chart stops at the
   * incremental cost.
   */
  readonly funding?: FundingBridge;
}

/**
 * Build the cost bridge from an evaluated scenario.
 *
 * Every instrument is kept, including the ones worth exactly zero. An
 * inactive scheme is INFORMATION: "this corridor touches no EEA port, so ETS
 * does not bite" is a result a reader needs, and silently omitting it makes
 * an inapplicable instrument indistinguishable from one nobody modelled.
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

  const deltas: Record<RegulationKey, number> = {
    ets: s.etsGreenPvUsdM - s.etsFossilPvUsdM,
    fuelEu: s.fuelEuGreenPvUsdM - s.fuelEuFossilPvUsdM,
    ira45z: s.ira45zGreenPvUsdM,
    imoNetZero: imoDelta,
    selfDesigned: s.selfDesignedGreenPvUsdM - s.selfDesignedFossilPvUsdM,
  };

  const blocks: readonly BridgeBlock[] = [
    ...REGULATION_KEYS.map(
      (key): BridgeBlock => ({ key, deltaUsdM: deltas[key], stop: "regulation" }),
    ),
    // Financing is NOT regulation — it is an interest saving actually paid,
    // and it defaults off. Its own bar, never inside the regulation one.
    {
      key: "financing",
      deltaUsdM: s.financingGreenPvUsdM ?? 0,
      stop: "financing",
    },
  ];

  const group = (key: BridgeGroup["key"]): BridgeGroup => {
    const parts = blocks.filter((b) => b.stop === key);
    return {
      key,
      deltaUsdM: parts.reduce((acc, b) => acc + b.deltaUsdM, 0),
      parts,
    };
  };
  const groups = [group("regulation"), group("financing")];

  return {
    greenTotalUsdM,
    fossilTotalUsdM,
    grossUsdM,
    blocks,
    groups,
    incrementalUsdM:
      grossUsdM + groups.reduce((acc, g) => acc + g.deltaUsdM, 0),
  };
}

/**
 * Attach the funding split to a cost bridge.
 *
 * Separate from `buildCostBridge` because it needs the SCENARIO — the
 * willingness to pay is an input, not a result — and because the split is a
 * different kind of statement: an allocation of a cost, not a component of
 * one. Returns the bridge unchanged when no willingness to pay is set, which
 * is the default.
 */
export function withFunding(
  bridge: CostBridge,
  result: ScenarioResult,
  willingnessToPayUsdPerTonneCo2: number | undefined,
): CostBridge {
  const wtp = willingnessToPayUsdPerTonneCo2 ?? 0;
  if (wtp <= 0) return bridge;

  // Priced per tonne ABATED, so it scales with what the corridor actually
  // delivers — a commitment to fund decarbonisation, not to fund freight.
  const cargoOwnerUsdM = (wtp * result.summary.co2AbatedTonnes) / 1e6;

  return {
    ...bridge,
    funding: {
      incrementalUsdM: bridge.incrementalUsdM,
      cargoOwnerUsdM,
      // Never clamped at zero: a negative residual means the cargo owner
      // would cover more than the gap, which is a real and interesting
      // result (the corridor pays for itself commercially) and must not be
      // hidden behind a floor.
      publicSupportUsdM: bridge.incrementalUsdM - cargoOwnerUsdM,
      willingnessToPayUsdPerTonneCo2: wtp,
    },
  };
}

/**
 * The closure residual: what the COST bridge fails to explain, in $m.
 *
 * Near-zero means every dollar between the gross gap and the headline is
 * attributed to a named block. Exposed rather than asserted internally so a
 * test can pin it and the UI could surface a warning if it ever drifts.
 *
 * Expect ~1e-13 absolute, i.e. ≤1e-15 relative: association order differs
 * from the engine's (see the file header). Compare RELATIVE to the gap, not
 * absolute — an absolute threshold that suits a $1,800m corridor is
 * meaningless on a $200m one.
 *
 * The FUNDING split is not part of this: it allocates the headline rather
 * than composing it, and balances by construction.
 */
export function costBridgeClosure(result: ScenarioResult): number {
  return buildCostBridge(result).incrementalUsdM - result.summary.gapPvUsdM;
}
