/**
 * Tornado arithmetic — impact on the scenario in front of you.
 *
 * Leverage is a property of the model (measured offline, per archetype).
 * Exposure is a researched range (declared, cited, versioned). This puts the
 * two together on the USER's scenario rather than on a reference corridor,
 * which is what answers "what actually drives MY corridor".
 *
 * EVALUATE, NEVER EXTRAPOLATE. Each bar is two full engine evaluations at the
 * declared low and high. Multiplying an elasticity by a range width would be
 * cheaper and would silently lie wherever the model is non-linear — and the
 * elasticity artifact already flags asymmetric fields, so the non-linearity is
 * known to exist rather than hypothetical.
 *
 * Pure: no React, no I/O. The panel renders what this returns.
 */

import {
  resolveScenario,
  uncertaintyFor,
  type ScenarioInput,
  type UncertaintyDataset,
  type UncertaintyRow,
  type RefBundle,
} from "@h2map/corridor-schema";
import { evaluateScenario } from "@h2map/corridor-engine";

/** The KPIs a tornado can be drawn against — the sweep's own vocabulary. */
export const TORNADO_KPIS = [
  "gapPvUsdM",
  "costPerUnitUsd",
  "costPerTonneCo2Usd",
  "greenTotalPvUsdM",
  "fossilTotalPvUsdM",
  "co2AbatedTonnes",
] as const;
export type TornadoKpi = (typeof TORNADO_KPIS)[number];

export interface TornadoBar {
  id: string;
  /** Result at the declared low / high of the range. */
  low: number;
  high: number;
  /** The unperturbed scenario's value — the axis anchor. */
  base: number;
  /** |high − low|. Bars sort by this. */
  span: number;
  /** The declared range, in its own units, for the label. */
  rangeLow: number;
  rangeHigh: number;
  unit: string;
  verified: boolean;
  basisType: string;
  /** The cited sentence — the answer when someone challenges the range. */
  uncertaintyBasis: string;
  /** True when this id is a coupling group, rendered as ONE bar. */
  coupled: boolean;
}

export interface TornadoResult {
  base: number;
  bars: TornadoBar[];
  /**
   * Ids with declared uncertainty that could not be applied to THIS scenario
   * — e.g. a merchant-price range on a corridor that builds its own fuel, so
   * there is no price to move. Reported rather than dropped: a silently
   * missing bar reads as "this does not matter here".
   */
  inapplicable: { id: string; reason: string }[];
}

/**
 * How a declared range becomes a scenario edit.
 *
 * THREE SEMANTICS, and mixing them is the failure this module is shaped
 * around. A WACC row is written in PERCENTAGE POINTS (6.0, not 0.06); setting
 * 6 where the engine wants 0.06 produces a gap of $1,371.9m against the
 * correct $1,779.3m — no error, no warning, a plausible number that is simply
 * wrong. `tornado.test.ts` pins that case specifically.
 *
 *   fraction  — multiply the field's CURRENT value (energy demand: "+12% of
 *               delivered energy" means the corridor burns 12% more)
 *   absolute  — set the field directly (a price in $/t)
 *   points    — divide by 100, then set (a rate)
 */
type Apply = (s: ScenarioInput, value: number) => void;
export type ApplyKind = "fraction" | "absolute" | "points" | "relativeToBand";

const setPath = (s: ScenarioInput, path: string, value: number): void => {
  const keys = path.split(".");
  let node = s as unknown as Record<string, unknown>;
  for (const k of keys.slice(0, -1)) {
    const next = node[k];
    if (next === null || typeof next !== "object") return;
    node = next as Record<string, unknown>;
  }
  node[keys[keys.length - 1]!] = value;
};

const readPath = (s: ScenarioInput, path: string): number | null => {
  let node: unknown = s;
  for (const k of path.split(".")) {
    if (node === null || typeof node !== "object") return null;
    node = (node as Record<string, unknown>)[k];
  }
  return typeof node === "number" ? node : null;
};

/** Scale a field by (1 + fraction), leaving it alone when it is unset. */
const scalePath =
  (path: string): Apply =>
  (s, fraction) => {
    const cur = readPath(s, path);
    if (cur === null) return;
    setPath(s, path, cur * (1 + fraction));
  };

/**
 * What each declared id does to a scenario.
 *
 * Group ids expand to every member, applied TOGETHER — that is the whole
 * point of a coupling group, and it is why `energy-demand` moves both sides'
 * burns by the same fraction rather than one at a time. Moving one alone
 * drives `energyParity.diverged` true, which the model treats as a physically
 * inconsistent corridor.
 */
/**
 * EXPORTED so the Monte Carlo samples through exactly the same appliers.
 * The unit semantics (percentage points) and the level semantics (a band
 * shape applied to the scenario's own level) were each the site of a real
 * defect; two copies would eventually disagree about one of them, and the
 * tornado and the band would quietly describe different corridors.
 */
export const APPLIERS: Record<string, { kind: ApplyKind; apply: Apply }> = {
  "energy-demand": {
    kind: "fraction",
    apply: (s, f) => {
      // Both sides together, so delivered energy stays matched.
      scalePath("green.overrides.fuelTonnesPerVesselYear")(s, f);
      scalePath("fossil.overrides.fuelTonnesPerVesselYear")(s, f);
      // A derived burn has no override to scale; move the geometry instead,
      // which is what drives consumption on those scenarios.
      if (
        readPath(s, "green.overrides.fuelTonnesPerVesselYear") === null &&
        readPath(s, "fossil.overrides.fuelTonnesPerVesselYear") === null
      ) {
        scalePath("cargo.oneWayDistanceNm")(s, f);
      }
    },
  },
  "green.priceUsdPerTonne": {
    kind: "absolute",
    apply: (s, v) => setPath(s, "green.overrides.priceUsdPerTonne", v),
  },
  // The two vessel groups are RELATIVE, not absolute, and the distinction is
  // load-bearing. A researched newbuild band is a market level for one hull
  // class; the scenario in front of the user may sit anywhere relative to it —
  // archetype B carries $35m fossil / $44m green overrides while its
  // Newcastlemax band runs 70-82. Setting the bound directly would measure a
  // LEVEL CHANGE ($35m -> $70m) plus a range, and the bar would show both ends
  // above the baseline, which is not a tornado.
  //
  // So the band's shape is applied to the scenario's own level: each bound
  // becomes its ratio to the band's midpoint, and both sides move together —
  // preserving the green premium, which is separately verified reference data.
  "fleet-capital": {
    kind: "relativeToBand",
    apply: (s, factor) => {
      for (const p of [
        "vessel.green.capexUsdMPerShip",
        "vessel.fossil.capexUsdMPerShip",
      ]) {
        const cur = readPath(s, p);
        if (cur !== null) setPath(s, p, cur * factor);
      }
    },
  },
  "vessel-opex": {
    kind: "relativeToBand",
    apply: (s, factor) => {
      for (const p of [
        "vessel.green.opexUsdMPerShipPerYear",
        "vessel.fossil.opexUsdMPerShipPerYear",
      ]) {
        const cur = readPath(s, p);
        if (cur !== null) setPath(s, p, cur * factor);
      }
    },
  },
  "cargo.wacc": {
    kind: "points",
    apply: (s, v) => setPath(s, "cargo.waccOverride", v),
  },
  "cargo.inflation": {
    kind: "points",
    apply: (s, v) => setPath(s, "cargo.inflation", v),
  },
};

/**
 * Convert a declared bound into the value its applier expects.
 *
 * `relativeToBand` needs the WHOLE row, because a bound only means something
 * against the band's own midpoint: 70 out of 70-82 is "12% below the middle
 * of the market", which is the shape that transfers to a scenario sitting at
 * a different level.
 */
export const toApplied = (
  kind: ApplyKind,
  bound: number,
  row: UncertaintyRow,
): number => {
  if (kind === "points") return bound / 100;
  if (kind === "relativeToBand") {
    const centre = row.mode ?? (row.low + row.high) / 2;
    return centre === 0 ? 1 : bound / centre;
  }
  return bound;
};

/**
 * The declared range in its own units — "$70–82m", "−5%…+12%".
 *
 * Shared by the results panel and the documentation so the same researched
 * range can never print two different ways.
 */
export function rangeLabel(low: number, high: number, unit: string): string {
  if (unit.startsWith("fraction of")) {
    const pct = (v: number) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(0)}%`;
    return `${pct(low)}…${pct(high)}`;
  }
  if (unit.startsWith("percentage points")) return `${low}–${high}%`;
  if (unit.startsWith("USD million")) return `$${low}–${high}m`;
  if (unit.startsWith("USD per tonne")) return `$${low}–${high}/t`;
  return `${low}–${high}`;
}

/**
 * Build the tornado for one scenario.
 *
 * `archetypeKey` selects which scoped ranges apply. A range scoped to another
 * archetype is not silently borrowed — the researched e-methanol price applies
 * to a methanol corridor and would be wrong on an ammonia one.
 */
export function buildTornado(
  scenario: ScenarioInput,
  bundle: RefBundle,
  uncertainty: UncertaintyDataset,
  kpi: TornadoKpi,
  archetypeKey: string,
): TornadoResult {
  const evaluate = (edit?: (s: ScenarioInput) => void): number | null => {
    try {
      const copy = JSON.parse(JSON.stringify(scenario)) as ScenarioInput;
      edit?.(copy);
      return evaluateScenario(resolveScenario(copy, bundle)).summary[kpi];
    } catch {
      return null;
    }
  };

  const base = evaluate();
  if (base === null) return { base: Number.NaN, bars: [], inapplicable: [] };

  const bars: TornadoBar[] = [];
  const inapplicable: { id: string; reason: string }[] = [];

  for (const row of uncertaintyFor(uncertainty, archetypeKey)) {
    const applier = APPLIERS[row.id];
    if (!applier) {
      inapplicable.push({ id: row.id, reason: "no applier declared for this id" });
      continue;
    }
    const low = evaluate((s) => applier.apply(s, toApplied(applier.kind, row.low, row)));
    const high = evaluate((s) => applier.apply(s, toApplied(applier.kind, row.high, row)));
    if (low === null || high === null) {
      inapplicable.push({ id: row.id, reason: "scenario does not evaluate at this range" });
      continue;
    }
    if (low === base && high === base) {
      // The field exists but this scenario does not use it — a merchant price
      // on a corridor that builds its own fuel, for instance.
      inapplicable.push({ id: row.id, reason: "no effect on this scenario" });
      continue;
    }
    bars.push({
      id: row.id,
      low,
      high,
      base,
      span: Math.abs(high - low),
      rangeLow: row.low,
      rangeHigh: row.high,
      unit: row.unit,
      verified: row.verified,
      basisType: row.basisType,
      uncertaintyBasis: row.uncertaintyBasis,
      coupled: row.appliesTo === "group",
    });
  }

  bars.sort((a, b) => b.span - a.span);
  return { base, bars, inapplicable };
}

/** Rows declared for this archetype — used to report what is NOT quantified. */
export function declaredIds(
  uncertainty: UncertaintyDataset,
  archetypeKey: string,
): Set<string> {
  return new Set(uncertaintyFor(uncertainty, archetypeKey).map((r: UncertaintyRow) => r.id));
}
