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
 *           Sources are the model's own advisory signals only (delivered-
 *           energy parity divergence, material port-energy share, routed-
 *           vs-typed distance divergence). Data-quality provenance —
 *           unverified benchmarks — stays on the FIELD's badge and never
 *           reaches the tab: a triangle for "the reference row is
 *           unverified" read as a problem with the user's input, which it
 *           is not.
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
  | "intro" | "energy" | "vessels" | "cargo" | "ports" | "financing" | "regulation";
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
 */
const WARNINGS: readonly {
  tab: InputTab;
  reasonKey: string;
  targetFieldId?: string;
  when: (model: CorridorModel) => boolean;
}[] = [
  {
    // Port days account for a material share (>10%) of round-trip energy —
    // and every day rate behind that share is an estimate.
    tab: "vessels",
    reasonKey: "portShare",
    when: (m) => m.result?.portEnergy?.material === true,
  },
  {
    // The two sides no longer deliver the same energy (one-sided burn
    // override) — abatement compares unequal transport work.
    tab: "energy",
    reasonKey: "energyParity",
    when: (m) => m.result?.energyParity.diverged === true,
  },
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

const ALL_TABS: readonly TabKey[] = [
  "projects", "intro", "energy", "vessels", "cargo", "ports",
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
    "intro", "energy", "vessels", "cargo", "ports", "financing", "regulation",
  ];
  return tabs.find((k) => statuses[k].state === "red") ?? null;
}
