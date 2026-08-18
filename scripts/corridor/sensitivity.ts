/**
 * Input sensitivity harness (build-plan 1.7).
 *
 * One-at-a-time sweep of every numeric scenario input across its plausible
 * range against the headline gap (PV $m), from the Excel-default baseline
 * scenario. Outputs:
 *
 *   data/corridor-sensitivity/sensitivity.json  — full ranked artifact
 *   data/corridor-sensitivity/ui-manifest.json  — the UI field hierarchy:
 *     params whose headline movement ≥ 5% are TOP-LEVEL, the rest advanced.
 *     Phase 3 renders form prominence from this file.
 *
 *   npx tsx scripts/corridor/sensitivity.ts           # regenerate both
 *   npx tsx scripts/corridor/sensitivity.ts --check   # CI drift gate:
 *     fails when the computed top-level set no longer matches the committed
 *     manifest — the interface must track the model.
 *
 * Deterministic (pure engine + committed bundle + committed fixture), so it
 * is safe to run per-PR in CI.
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { parseRefBundle } from "@h2map/corridor-schema";
// The parameter table, the six KPIs and the evaluator live in ./lib/params so
// the elasticity harness can run the SAME parameters against other scenarios.
// This script keeps its own baseline posture and its own artifacts.
import {
  KPIS,
  PARAMS,
  kpisFor as kpisForScenario,
  type KpiId,
  type KpiVector,
} from "./lib/params";

const ROOT = new URL("../../", import.meta.url);
const OUT_DIR = new URL("data/corridor-sensitivity/", ROOT);
const SENS_PATH = new URL("sensitivity.json", OUT_DIR);
const MANIFEST_PATH = new URL("ui-manifest.json", OUT_DIR);
const TOP_LEVEL_THRESHOLD = 0.05; // ±5% headline movement

const bundle = parseRefBundle(
  JSON.parse(readFileSync(new URL("data/corridor-ref/2026-07-30-excel-v1.json", ROOT), "utf8")),
);
/**
 * THE SWEEP BASELINE.
 *
 * Starts from the frozen workbook fixture — deterministic, committed, and
 * the same corridor geometry the sensitivity figures have always described
 * — then applies the app's ACTUAL default posture on the two axes where the
 * fixture is deliberately not the app:
 *
 * 1. `emissionsBasis: "wellToWake"`. The fixture carries no flags, so it
 *    falls to the Excel-faithful COMBUSTION basis. That is correct for the
 *    fixture (the golden test proves the transcription) but wrong for a
 *    sweep that claims to say what moves the model people run: on a TTW
 *    basis a well-to-TANK factor is inert almost by definition, which is
 *    why `green.certifiedWttGco2ePerMj` measured ~0.0% while §21 records it
 *    moving abatement −23% and $/tCO2 +34%. Every scenario the UI creates
 *    has been well-to-wake since 2026-07-31.
 *
 * 2. Burn overrides NULL on both sides. A frozen burn makes consumption
 *    constant, so `cargo.oneWayDistanceNm` would measure 0.0%, lose its ≥5%
 *    top-level placement and be demoted — a real field pushed into the
 *    Advanced fold by a bookkeeping choice in the baseline rather than by
 *    its actual influence. (The fixture is already null here; this asserts
 *    it, so a future fixture edit cannot silently regress the manifest.)
 *
 * The FIXTURE FILE IS NEVER EDITED — the golden test still pins the
 * workbook's combustion-basis numbers exactly. This is a sweep-local copy.
 */
const baseRaw = (() => {
  const raw = JSON.parse(
    readFileSync(new URL("fixtures/golden/corridor/excel-baseline.input.json", ROOT), "utf8"),
  ) as Record<string, unknown>;
  const flags = (raw.flags ?? {}) as Record<string, unknown>;
  flags.emissionsBasis = "wellToWake";
  raw.flags = flags;
  for (const side of ["green", "fossil"] as const) {
    const s = raw[side] as { overrides: Record<string, unknown> };
    if (s.overrides.fuelTonnesPerVesselYear != null) {
      throw new Error(
        `sweep baseline: ${side}.overrides.fuelTonnesPerVesselYear must be null — ` +
          "a frozen burn makes corridor length measure 0% and demotes it",
      );
    }
  }
  return raw as unknown;
})();






function main(): void {
  const checkMode = process.argv.includes("--check");
  const base = kpisForScenario(baseRaw, bundle);

  /** Relative movement of every KPI between a param's sampled settings. */
  const movementOf = (samples: KpiVector[]) => {
    const per = {} as Record<KpiId, number>;
    for (const { id } of KPIS) {
      const b = base[id];
      let worst = 0;
      for (const v of samples) {
        // Relative to the BASELINE value of that KPI, so KPIs on wildly
        // different scales ($m vs tonnes vs $/t) compare on equal terms.
        const rel = b === 0 ? (v[id] === 0 ? 0 : Infinity) : Math.abs((v[id] - b) / b);
        if (Number.isFinite(rel) && rel > worst) worst = rel;
      }
      per[id] = worst;
    }
    return per;
  };

  const rows = PARAMS.map((p) => {
    // Numeric params sample their endpoints; enum params sample every
    // defined option, so a categorical driver can rank instead of being
    // skipped as "—".
    const samples = p.options
      ? p.options.map((o) => kpisForScenario(baseRaw, bundle, (s) => p.setOption!(s, o)))
      : [
          kpisForScenario(baseRaw, bundle, (s) => p.set!(s, p.low!)),
          kpisForScenario(baseRaw, bundle, (s) => p.set!(s, p.high!)),
        ];
    const per = movementOf(samples);
    // Placement comes from the MAX across KPIs; the KPI that produced it is
    // recorded so a field's prominence is traceable to the output it moves.
    let binding: KpiId = "gapPvUsdM";
    for (const { id } of KPIS) if (per[id] > per[binding]) binding = id;
    const gapSamples = samples.map((v) => v.gapPvUsdM);
    return {
      id: p.id,
      label: p.label,
      step: p.step,
      range: p.options ? p.options : ([p.low, p.high] as const),
      // Gap columns kept for continuity — §20's primary ranking is still
      // the gap, so the historical figures stay comparable.
      gapAtLow: gapSamples[0]!,
      gapAtHigh: gapSamples[gapSamples.length - 1]!,
      maxAbsDeltaUsdM: Math.max(
        ...gapSamples.map((g) => Math.abs(g - base.gapPvUsdM)),
      ),
      relHeadlineMovement: per.gapPvUsdM,
      /** Per-KPI relative movement, and the one that binds placement. */
      movementByKpi: per,
      bindingKpi: binding,
      maxRelMovement: per[binding],
    };
  }).sort((a, b) => b.maxAbsDeltaUsdM - a.maxAbsDeltaUsdM);

  // UI prominence is computed over the FROZEN ui-flagged subset only — the
  // docs-only extension must never move a field in the interface.
  const uiIds = new Set(PARAMS.filter((p) => p.ui).map((p) => p.id));
  const uiRows = rows.filter((r) => uiIds.has(r.id));
  // Placement from the MAX across KPIs, not the gap alone: a field that
  // barely moves the gap but drives $/cargo unit or $/tCO2 is a top-level
  // field, and was previously buried in advanced.
  const topLevel = uiRows
    .filter((r) => r.maxRelMovement >= TOP_LEVEL_THRESHOLD)
    .map((r) => r.id);
  const advanced = uiRows
    .filter((r) => r.maxRelMovement < TOP_LEVEL_THRESHOLD)
    .map((r) => r.id);

  if (checkMode) {
    if (!existsSync(MANIFEST_PATH)) {
      console.error("ui-manifest.json missing — run: npx tsx scripts/corridor/sensitivity.ts");
      process.exitCode = 1;
      return;
    }
    const committed = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
      topLevel: string[];
    };
    const want = new Set(topLevel);
    const have = new Set(committed.topLevel);
    const missing = topLevel.filter((id) => !have.has(id));
    const stale = committed.topLevel.filter((id) => !want.has(id));
    if (missing.length || stale.length) {
      console.error(
        "SENSITIVITY DRIFT: the model's top-level input set changed — the UI manifest must track the model.\n" +
          (missing.length ? `  now ≥5% but not in manifest: ${missing.join(", ")}\n` : "") +
          (stale.length ? `  in manifest but now <5%:     ${stale.join(", ")}\n` : "") +
          "Regenerate + review: npx tsx scripts/corridor/sensitivity.ts",
      );
      process.exitCode = 1;
      return;
    }
    console.log(`sensitivity check OK: ${topLevel.length} top-level params unchanged`);
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    SENS_PATH,
    JSON.stringify(
      {
        baseline: "excel-baseline",
        refBundleId: bundle.bundleId,
        baseGapPvUsdM: base.gapPvUsdM,
        baseKpis: base,
        kpis: KPIS,
        topLevelThreshold: TOP_LEVEL_THRESHOLD,
        ranked: rows,
      },
      null,
      1,
    ) + "\n",
  );
  writeFileSync(
    MANIFEST_PATH,
    JSON.stringify(
      {
        generatedFrom: "sensitivity.json",
        note: "Field prominence for the corridor UI: topLevel ≥5% headline movement among the ui-flagged sweep params, rest advanced. Docs-only sweep params never enter this file. CI (--check) fails when this drifts from the model.",
        topLevel,
        advanced,
      },
      null,
      1,
    ) + "\n",
  );
  console.log(`base gap ${base.gapPvUsdM.toFixed(3)} $m · ${rows.length} params swept`);
  console.log(`top-level (${topLevel.length}): ${topLevel.join(", ")}`);
  console.log(`wrote data/corridor-sensitivity/{sensitivity,ui-manifest}.json`);
}

main();
