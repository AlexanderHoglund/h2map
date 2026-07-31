"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  migrateScenarioInput,
  parseRefBundle,
  resolveScenario,
  type RefBundle,
  type ResolvedScenario,
  type ScenarioInput,
} from "@h2map/corridor-schema";
import { evaluateScenario, synthesize } from "@h2map/corridor-engine";
import { getSynthesisBenchmark } from "@h2map/corridor-schema";
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
  // The fixture is frozen at v1; the migration registry brings it to current.
  const input = migrateScenarioInput(JSON.parse(JSON.stringify(fixtureDefaults))).input;
  // APP DEFAULT (deliberately supersedes the workbook): CO2 abated and
  // $/tCO2 use the WELL-TO-WAKE basis — a decarbonization tool should count
  // the full fuel chain, not only stack emissions (divergence D1). Set
  // EXPLICITLY on new scenarios so saved payloads keep their meaning; the
  // engine's flag-absent default stays combustion (= Excel), which is what
  // keeps the frozen golden fixture exact. TTW remains selectable in the
  // Regulation step's Model options for workbook comparison.
  input.flags = { emissionsBasis: "wellToWake", ...(input.flags ?? {}) };
  return input;
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
const SITE_PICK_KEY = "corridor-site-pick";

/**
 * Consume a site handed over from the Explorer ("use as corridor fuel site"):
 * switch the green side to build-here with a delivered price derived from the
 * cell's LCOH via carrier synthesis + default logistics. One-shot — the key
 * is cleared; the user refines config in the Fuel step's build-here panel.
 */
function applySitePick(scenario: ScenarioInput): ScenarioInput {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SITE_PICK_KEY);
  } catch {
    return scenario;
  }
  if (!raw) return scenario;
  localStorage.removeItem(SITE_PICK_KEY);
  try {
    const pick = JSON.parse(raw) as { h3: string; lat: number; lon: number; lcoh: number };
    if (typeof pick.lcoh !== "number" || !pick.h3) return scenario;
    const next = JSON.parse(JSON.stringify(scenario)) as ScenarioInput;
    // Ensure a synthesizable carrier (fall back to the workbook's e-ammonia).
    let carrier;
    try {
      carrier = getSynthesisBenchmark(next.green.fuelId);
    } catch {
      next.green.fuelId = "e-ammonia";
      carrier = getSynthesisBenchmark("e-ammonia");
    }
    const config = { productionWacc: 0.08, electricityUsdPerMwh: 60, co2UsdPerTonne: 30 };
    const distanceKm = 300;
    const synth = synthesize(pick.lcoh, carrier, config);
    const logistics = distanceKm * 1.3 * carrier.shippingUsdPerTonneKm;
    next.green.sourcing = "build-here";
    next.green.deliveredPriceUsdPerTonne =
      Math.round((synth.gateUsdPerTonne + logistics) * 100) / 100;
    next.green.buildHere = {
      h3: pick.h3,
      lat: pick.lat,
      lon: pick.lon,
      lcohUsdPerKg: pick.lcoh,
      carrierId: carrier.carrierId,
      synthesisGateUsdPerTonne: Math.round(synth.gateUsdPerTonne * 100) / 100,
      distanceKm,
      logisticsUsdPerTonne: Math.round(logistics * 100) / 100,
    };
    return next;
  } catch {
    return scenario;
  }
}

export interface CorridorModel {
  bundle: RefBundle;
  scenario: ScenarioInput;
  /** Mutate a deep clone; the model re-evaluates synchronously. */
  update: (mutate: (draft: ScenarioInput) => void) => void;
  reset: () => void;
  /** Replace the whole draft (loading a saved/shared scenario). */
  load: (payload: unknown) => void;
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
    let base: { scenario: ScenarioInput; hadDraft: boolean } | null = null;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) base = { scenario: migrateScenarioInput(JSON.parse(raw)).input, hadDraft: true };
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
    base ??= { scenario: defaultScenario(), hadDraft: false };
    // An Explorer hand-off ("use as corridor fuel site") lands here.
    return { ...base, scenario: applySitePick(base.scenario) };
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

  /** Replace the whole draft (loading a saved/shared scenario). Validates. */
  const load = useCallback((payload: unknown) => {
    setScenario(migrateScenarioInput(payload).input);
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
    load,
    ...evaluated,
    hadDraft: init.hadDraft,
  };
}
