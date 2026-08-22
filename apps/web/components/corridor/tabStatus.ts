// Relative, not the "@/" alias: this module is imported by the scripts
// vitest suite (lib/tabStatus.test.ts), which resolves without Next's paths.
import { plausibility } from "../../lib/corridor/plausibility";
import type { CorridorModel } from "./state";

/**
 * Per-tab status. Four states, with a strict priority per tab:
 *
 *   red > amber > (visited ? green : blue)
 *
 *  - blue:  not yet reviewed — the user has never opened (and left) this
 *           tab for this project. The wizard starts honest: nothing is
 *           "complete" before anyone has looked at it.
 *  - red:   blocks results. The scenario cannot evaluate and the fault is
 *           attributed to this tab (`model.error` via the ordered matchers).
 *  - amber: worth checking, visited or not — and it is NEVER masked by a
 *           visit: a tab with a live warning stays amber after "Next".
 *           THE RULE: a tab is amber exactly when some FIELD on it carries
 *           its own amber note — an implausible override (the plausibility
 *           tier) or the routed-distance divergence. No field warning, no
 *           tab warning: a triangle the user cannot clear by fixing a field
 *           is a forever-indication, which is why the old result-derived
 *           signals (port-energy share, energy parity) no longer reach the
 *           tab — their notes stay in the tab BODY as information.
 *           Data-quality provenance — unverified benchmarks — likewise
 *           stays on the FIELD's badge and never reaches the tab: a
 *           triangle for "the reference row is unverified" read as a
 *           problem with the user's input, which it is not.
 *  - green: reviewed and nothing flagged. Green is a claim the user made
 *           (they moved on) combined with a claim the model makes (no
 *           warning) — never a default.
 */
export type TabState = "blue" | "green" | "amber" | "red";

export interface TabStatus {
  state: TabState;
  /** data-field-id of the offending control, for focus-on-navigate. */
  targetFieldId?: string;
  /** i18n keys under corridor.tabStatusReason.* explaining amber/red. */
  reasonKeys: string[];
}

export type InputTab =
  | "intro" | "cargo" | "vessels" | "energy" | "ports" | "financing" | "regulation";
export type TabKey = InputTab | "projects" | "results";

/** Ordered error→tab attribution; the first match wins. Every resolve/
 *  evaluate throw today names its subject (build-here, fuelId, the
 *  double-count's "fuel price", bundle pins, phasing weights). */
const ERROR_MATCHERS: readonly [RegExp, InputTab | "projects", string | undefined][] = [
  [/build-?here/i, "energy", "green.sourcing"],
  [/fuelId|fuel price|double-count/i, "energy", "green.sourcing"],
  [/vessel/i, "vessels", undefined],
  [/port/i, "ports", undefined],
  // The phasing sum rule throws by name; the target focuses the offending
  // weights grid (steps.tsx tags the out-of-sum side with this id).
  [/capitalPhasing/i, "financing", "capitalPhasing"],
  [/financing/i, "financing", undefined],
  [/regulation/i, "regulation", undefined],
  // A bundle-pin mismatch is a property of the loaded project, not of any
  // input tab.
  [/pins bundle/i, "projects", undefined],
  [/cargo|unitsPerYear|roundtrip/i, "cargo", undefined],
];

/**
 * Advisory signals, attributed to the tab whose controls govern them.
 * Several tabs can be amber at once; a tab can carry several reasons.
 * Every entry MUST mirror a warning some field on that tab shows itself —
 * see the amber doctrine above.
 */
const WARNINGS: readonly {
  tab: InputTab;
  reasonKey: string;
  targetFieldId?: string;
  when: (model: CorridorModel) => boolean;
}[] = [
  {
    // Typed distance disagrees with the routed shipping-lane distance by
    // more than 15% — same threshold as the inline note on the field.
    tab: "intro",
    reasonKey: "routedDivergence",
    when: (m) => {
      const routed = m.scenario.cargo.routedDistance?.nm;
      if (!routed) return false;
      const typed = m.scenario.cargo.oneWayDistanceNm;
      return Math.abs(typed - routed) / routed > 0.15;
    },
  },
];

/**
 * The plausibility notes ResolvedField renders, rolled up per tab: same
 * pure check (`plausibility`), same benchmarks, same session baseline, same
 * exemptions as the call sites in steps.tsx — a tab goes amber exactly when
 * one of its fields is showing the note. A value equal to what the session
 * LOADED never warns (curated study overrides are the scenario's own data,
 * not user slips), so reopening a project clears every triangle. Kept as a
 * WALK over the scenario's override slots rather than DOM inspection; if a
 * slot is added to the form it should be added here with the tab it renders
 * on.
 */
function implausibleTabs(model: CorridorModel): Set<InputTab> {
  const out = new Set<InputTab>();
  const { scenario, loaded, benchmarks } = model;
  if (!benchmarks) return out;
  const legacy = scenario.flags?.legacyExcelConstruct === true;
  const mark = (
    tab: InputTab,
    override: number | null | undefined,
    baseline: number | null | undefined,
    benchmark: number,
  ) => {
    const o = override ?? null;
    if (o === (baseline ?? null)) return; // unchanged since load — theirs, not a slip
    if (plausibility(o, benchmark) !== null) out.add(tab);
  };
  for (const side of ["green", "fossil"] as const) {
    const s = scenario[side];
    const o = s.overrides;
    const l = loaded[side].overrides;
    const b = benchmarks[side];
    // Price: only under purchase — plant modes zero it by definition, and
    // the legacy double-count remedy is exactly a typed 0 (expectZero).
    if (s.sourcing === "purchase") {
      mark("energy", o.priceUsdPerTonne, l.priceUsdPerTonne, b.priceUsdPerTonne.value);
    }
    // Production lines: live only under build-plant; under legacy, zeroing
    // one is the documented remedy (expectZero at the call site).
    if (s.sourcing === "build-plant" && !legacy) {
      mark("energy", o.prodCapexUsdM, l.prodCapexUsdM, b.prodCapexUsdM.value);
      mark("energy", o.prodOpexUsdMPerYear, l.prodOpexUsdMPerYear, b.prodOpexUsdMPerYear.value);
    }
    if (s.sourcing === "build-here" && s.buildHere) {
      const lc = loaded[side].buildHere?.components;
      for (const [k, c] of Object.entries(s.buildHere.components)) {
        mark(
          "energy",
          c.overrideUsdM,
          lc?.[k as keyof NonNullable<typeof lc>]?.overrideUsdM,
          c.derivedUsdM,
        );
      }
    }
    mark("energy", o.combustionEfTco2PerTonne, l.combustionEfTco2PerTonne, b.combustionEf.value);
    mark("energy", o.lhvMjPerTonne, l.lhvMjPerTonne, b.lhv.value);
    mark("energy", o.wtwGco2PerMj, l.wtwGco2PerMj, b.wtw.value);
    mark("energy", o.fuelTonnesPerVesselYear, l.fuelTonnesPerVesselYear, b.tonnesPerVesselYear.value);
    mark("ports", o.portStorageCapexUsdM, l.portStorageCapexUsdM, b.portStorageCapexUsdM.value);
    mark("ports", o.portStorageOpexUsdMPerYear, l.portStorageOpexUsdMPerYear, b.portStorageOpexUsdMPerYear.value);
    mark("ports", o.bargeCapexUsdM, l.bargeCapexUsdM, b.bargeCapexUsdM.value);
    mark("ports", o.bargeOpexUsdMPerYear, l.bargeOpexUsdMPerYear, b.bargeOpexUsdMPerYear.value);
    mark(
      "vessels",
      scenario.vessel[side].capexUsdMPerShip,
      loaded.vessel[side].capexUsdMPerShip,
      b.vesselCapexUsdMPerShip.value,
    );
    mark(
      "vessels",
      scenario.vessel[side].opexUsdMPerShipPerYear,
      loaded.vessel[side].opexUsdMPerShipPerYear,
      b.vesselOpexUsdMPerShipPerYear.value,
    );
  }
  mark("financing", scenario.cargo.waccOverride, loaded.cargo.waccOverride, benchmarks.wacc.value);
  return out;
}

const ALL_TABS: readonly TabKey[] = [
  "projects", "intro", "cargo", "vessels", "energy", "ports",
  "financing", "regulation", "results",
];

export function tabStatuses(
  model: CorridorModel,
  visited: ReadonlySet<string>,
): Record<TabKey, TabStatus> {
  const statuses = {} as Record<TabKey, TabStatus>;
  for (const k of ALL_TABS) {
    // Projects is a picker, not a form to review — it has no blue state.
    statuses[k] = {
      state: k === "projects" || visited.has(k) ? "green" : "blue",
      reasonKeys: [],
    };
  }

  // Amber next, so red can still override it below. Never masked by a
  // visit: green only exists where no warning fired.
  for (const w of WARNINGS) {
    if (!w.when(model)) continue;
    const s = statuses[w.tab];
    statuses[w.tab] = {
      state: "amber",
      targetFieldId: s.state === "amber" ? s.targetFieldId : w.targetFieldId,
      reasonKeys: [...s.reasonKeys, w.reasonKey],
    };
  }
  for (const tab of implausibleTabs(model)) {
    const s = statuses[tab];
    statuses[tab] = {
      state: "amber",
      targetFieldId: s.targetFieldId,
      reasonKeys: [...s.reasonKeys, "implausible"],
    };
  }

  if (model.error) {
    const hit = ERROR_MATCHERS.find(([re]) => re.test(model.error ?? ""));
    const [, tab, target] = hit ?? [/./, "intro" as InputTab, undefined];
    statuses[tab] = { state: "red", targetFieldId: target, reasonKeys: ["blocked"] };
    // Results is blocked by the same fault.
    statuses.results = { state: "red", targetFieldId: target, reasonKeys: ["blocked"] };
  }

  return statuses;
}

/** The first red input tab, if any — for the Results panel's fix link. */
export function firstBlockedTab(
  statuses: ReturnType<typeof tabStatuses>,
): InputTab | null {
  const tabs: InputTab[] = [
    "intro", "cargo", "vessels", "energy", "ports", "financing", "regulation",
  ];
  return tabs.find((k) => statuses[k].state === "red") ?? null;
}
