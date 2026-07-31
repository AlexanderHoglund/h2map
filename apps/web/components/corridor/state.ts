"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  parseRefBundle,
  parseScenarioInput,
  resolveScenario,
  type RefBundle,
  type ResolvedScenario,
  type ScenarioInput,
} from "@h2map/corridor-schema";
import { evaluateScenario } from "@h2map/corridor-engine";
import type { ScenarioResult } from "@h2map/corridor-schema";
import bundleJson from "../../../../data/corridor-ref/2026-07-30-excel-v1.json";
import fixtureDefaults from "../../../../fixtures/golden/corridor/excel-baseline.input.json";
import uiManifest from "../../../../data/corridor-sensitivity/ui-manifest.json";

/**
 * Corridor model state. The engine is pure and fast (a 20-year scenario is
 * microseconds), so the FULL evaluation runs synchronously on every change —
 * the results panel updates on keystroke, no server round-trip.
 *
 * Defaults ARE the frozen golden fixture input, so the untouched form
 * reproduces the workbook's numbers exactly (Phase 3 acceptance).
 */

export const DEFAULT_BUNDLE: RefBundle = parseRefBundle(bundleJson);

/** Sensitivity-driven field prominence (build-plan 3.2): id → advanced? */
const ADVANCED = new Set<string>((uiManifest as { advanced: string[] }).advanced);
export function isAdvanced(paramId: string): boolean {
  return ADVANCED.has(paramId);
}

export function defaultScenario(): ScenarioInput {
  return parseScenarioInput(JSON.parse(JSON.stringify(fixtureDefaults)));
}

/** Null every override so the resolution yields pure benchmark values. */
function clearOverrides(s: ScenarioInput): ScenarioInput {
  const c = JSON.parse(JSON.stringify(s)) as ScenarioInput;
  c.cargo.waccOverride = null;
  c.vessel.green = { capexUsdM: null, opexUsdMPerYear: null };
  c.vessel.fossil = { capexUsdM: null, opexUsdMPerYear: null };
  for (const side of [c.green, c.fossil]) {
    for (const k of Object.keys(side.overrides) as (keyof typeof side.overrides)[]) {
      side.overrides[k] = null;
    }
  }
  return c;
}

const DRAFT_KEY = "corridor-draft-v1";

export interface CorridorModel {
  bundle: RefBundle;
  scenario: ScenarioInput;
  /** Mutate a deep clone; the model re-evaluates synchronously. */
  update: (mutate: (draft: ScenarioInput) => void) => void;
  reset: () => void;
  resolved: ResolvedScenario | null;
  /** Benchmark-only resolution (all overrides null) for "benchmark: X — restore". */
  benchmarks: ResolvedScenario | null;
  result: ScenarioResult | null;
  /** Human-readable reason when the scenario cannot evaluate. */
  error: string | null;
  hadDraft: boolean;
}

export function useCorridorModel(): CorridorModel {
  // Lazy init restores the local draft synchronously — this hook only runs in
  // the ssr:false corridor island, so localStorage is always available.
  // Account save/share is scenario management (3.5).
  const [init] = useState<{ scenario: ScenarioInput; hadDraft: boolean }>(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) return { scenario: parseScenarioInput(JSON.parse(raw)), hadDraft: true };
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
    return { scenario: defaultScenario(), hadDraft: false };
  });
  const [scenario, setScenario] = useState<ScenarioInput>(init.scenario);

  // Debounced draft autosave.
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(scenario));
      } catch {
        /* storage full/blocked — drafts are best-effort */
      }
    }, 400);
    return () => clearTimeout(id);
  }, [scenario]);

  const update = useCallback((mutate: (draft: ScenarioInput) => void) => {
    setScenario((prev) => {
      const draft = JSON.parse(JSON.stringify(prev)) as ScenarioInput;
      mutate(draft);
      return draft;
    });
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY);
    setScenario(defaultScenario());
  }, []);

  const evaluated = useMemo(() => {
    try {
      const resolved = resolveScenario(scenario, DEFAULT_BUNDLE);
      const benchmarks = resolveScenario(clearOverrides(scenario), DEFAULT_BUNDLE);
      return { resolved, benchmarks, result: evaluateScenario(resolved), error: null };
    } catch (err) {
      return {
        resolved: null,
        benchmarks: null,
        result: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, [scenario]);

  return {
    bundle: DEFAULT_BUNDLE,
    scenario,
    update,
    reset,
    ...evaluated,
    hadDraft: init.hadDraft,
  };
}
