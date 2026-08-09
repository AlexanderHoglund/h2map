import type { CorridorModel } from "./state";

/**
 * Per-tab completion state, derived from VALIDATION — never from whether
 * the user has visited a tab.
 *
 *  - red:   blocks results. The tab holds a field that must be set before
 *           the model can produce a number (`model.error` attributed to a
 *           tab by the ordered matchers below).
 *  - amber: not blocking, but running on benchmarks where a real figure is
 *           expected. The rule (proposed in the sprint plan, derivable, not
 *           editorial): the tab contains ≥1 control that carries an
 *           UNVERIFIED reference benchmark, has top-level sensitivity rank,
 *           and is actually running on that benchmark (no override). Today
 *           that set is exactly cargo.wacc — the unverified country WACC
 *           table — which renders on Regulation & Financing.
 *  - green: complete.
 */
export type TabState = "green" | "amber" | "red";

export interface TabStatus {
  state: TabState;
  /** data-field-id of the offending control, for focus-on-navigate. */
  targetFieldId?: string;
}

type InputTab = "intro" | "energy" | "vessels" | "cargo" | "ports" | "regulation";

/** Ordered error→tab attribution; the first match wins. Every resolve/
 *  evaluate throw today names its subject (build-here, fuelId, the
 *  double-count's "fuel price", bundle pins). */
const ERROR_MATCHERS: readonly [RegExp, InputTab, string | undefined][] = [
  [/build-?here/i, "energy", "green.sourcing"],
  [/fuelId|fuel price|double-count/i, "energy", "green.sourcing"],
  [/vessel/i, "vessels", undefined],
  [/port/i, "ports", undefined],
  [/regulation/i, "regulation", undefined],
];

export function tabStatuses(
  model: CorridorModel,
): Record<InputTab | "projects" | "results", TabStatus> {
  const statuses: Record<InputTab | "projects" | "results", TabStatus> = {
    projects: { state: "green" },
    intro: { state: "green" },
    energy: { state: "green" },
    vessels: { state: "green" },
    cargo: { state: "green" },
    ports: { state: "green" },
    regulation: { state: "green" },
    results: { state: "green" },
  };

  if (model.error) {
    const hit = ERROR_MATCHERS.find(([re]) => re.test(model.error ?? ""));
    const [, tab, target] = hit ?? [/./, "intro" as InputTab, undefined];
    statuses[tab] = { state: "red", targetFieldId: target };
    // Results is blocked by the same fault.
    statuses.results = { state: "red", targetFieldId: target };
  }

  // Amber: unverified top-level benchmark actually in use. cargo.wacc is
  // the whole set today; every country WACC row is verified: false, and ids
  // outside the workbook's seven fall back to the generic "other" row
  // (mirroring getCountry's fallback).
  if (statuses.regulation.state === "green" && model.resolved) {
    const country =
      model.bundle.countries.find((c) => c.id === model.scenario.cargo.countryId) ??
      model.bundle.countries.find((c) => c.id === "other");
    if (model.resolved.wacc.source === "benchmark" && country?.verified === false) {
      statuses.regulation = { state: "amber", targetFieldId: "cargo.wacc" };
    }
  }

  return statuses;
}

/** The first red input tab, if any — for the Results panel's fix link. */
export function firstBlockedTab(
  statuses: ReturnType<typeof tabStatuses>,
): InputTab | null {
  const tabs: InputTab[] = ["intro", "energy", "vessels", "cargo", "ports", "regulation"];
  return tabs.find((k) => statuses[k].state === "red") ?? null;
}
