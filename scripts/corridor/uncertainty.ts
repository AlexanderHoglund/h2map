/**
 * Monte Carlo over the declared uncertainty, for the three archetypes.
 *
 *   npx tsx scripts/corridor/uncertainty.ts     # regenerate
 *   npm run corridor:uncertainty
 *
 * Writes data/corridor-sensitivity/uncertainty.json — a SUMMARY only. The
 * draws themselves are never committed: they are large, they are reproducible
 * from the seed, and a committed sample would rot the moment the engine moved.
 *
 * WHY THIS EXISTS BESIDE THE TORNADO. The tornado moves one input at a time
 * and is blind to interactions by construction. This samples every declared
 * range at once, so it reports a joint band rather than a set of independent
 * spans, and it can rank inputs by RANK CORRELATION with the outcome — an
 * importance measure that survives interaction and non-linearity.
 *
 * DETERMINISTIC AND CI-GATED. The whole run is ~2s (a full draw costs 0.059 ms
 * measured), so CI regenerates and diffs it exactly like the docs gate rather
 * than checking a staleness hash. An engine change that moves the band must be
 * committed, not discovered later.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  migrateScenarioInput,
  parseRefBundle,
  parseUncertaintyDataset,
  resolveScenario,
  uncertaintyFor,
  type ScenarioInput,
} from "@h2map/corridor-schema";
import { evaluateScenario, runUncertainty, type SampledInput } from "@h2map/corridor-engine";
import { KPIS } from "./lib/params";
import { ARCHETYPES } from "./lib/archetypes";
import { APPLIERS, buildTornado, toApplied } from "../../apps/web/lib/corridor/tornado";

const ROOT = new URL("../../", import.meta.url);
const OUT_DIR = new URL("data/corridor-sensitivity/", ROOT);
const OUT_PATH = new URL("uncertainty.json", OUT_DIR);

/** Draws per archetype. 4,000 is stable to the nearest $0.1m and takes ~0.3s. */
const DRAWS = 4000;
/** Committed with the artifact: the run must be reproducible bit-for-bit. */
const SEED = 20260819;

const bundle = parseRefBundle(
  JSON.parse(readFileSync(new URL("data/corridor-ref/2026-08-21-cruise-v6.json", ROOT), "utf8")),
);
const uncertainty = parseUncertaintyDataset(
  JSON.parse(
    readFileSync(
      new URL("data/input-uncertainty-ref/2026-08-19-uncertainty-v1.json", ROOT),
      "utf8",
    ),
  ),
);

const KPI_IDS = KPIS.map((k) => k.id);
const HEADLINE = "gapPvUsdM";

function main(): void {
  const scenarios = ARCHETYPES.map((a) => ({
    archetype: a,
    input: migrateScenarioInput(JSON.parse(JSON.stringify(a.build()))).input as ScenarioInput,
  }));

  const results = scenarios.map(({ archetype, input }) => {
    // The SAME appliers the tornado uses, so the two views can never disagree
    // about what a declared range means — the unit and level semantics they
    // encode were both the site of a real defect.
    const inputs: SampledInput[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const row of uncertaintyFor(uncertainty, archetype.key)) {
      const applier = APPLIERS[row.id];
      if (!applier) {
        skipped.push({ id: row.id, reason: "no applier declared for this id" });
        continue;
      }
      inputs.push({
        id: row.id,
        low: toApplied(applier.kind, row.low, row),
        high: toApplied(applier.kind, row.high, row),
        ...(row.mode === undefined
          ? {}
          : { mode: toApplied(applier.kind, row.mode, row) }),
        apply: (s, drawn) => applier.apply(s, drawn),
      });
    }

    const evaluate = (s: ScenarioInput): Record<string, number> => {
      const summary = evaluateScenario(resolveScenario(s, bundle)).summary as unknown as Record<
        string,
        number
      >;
      return Object.fromEntries(KPI_IDS.map((k) => [k, summary[k] ?? Number.NaN]));
    };

    const r = runUncertainty(input, inputs, evaluate, KPI_IDS, HEADLINE, {
      draws: DRAWS,
      seed: SEED,
    });
    // The TORNADO for this archetype, from the very same builder the results
    // panel uses — so the documentation cannot draw a different picture from
    // the app. Spans are two full engine evaluations per input; nothing here
    // is an approximation of the live panel, it IS the live panel's function.
    const tornado = buildTornado(input, bundle, uncertainty, HEADLINE, archetype.key);
    return {
      archetype: { key: archetype.key, id: archetype.id, label: archetype.label },
      sampledInputs: inputs.map((i) => i.id),
      skipped,
      tornado: {
        base: tornado.base,
        bars: tornado.bars.map((b) => ({
          id: b.id,
          low: b.low,
          high: b.high,
          span: b.span,
          rangeLow: b.rangeLow,
          rangeHigh: b.rangeHigh,
          unit: b.unit,
          verified: b.verified,
          coupled: b.coupled,
        })),
        inapplicable: tornado.inapplicable,
      },
      ...r,
    };
  });

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        generatedBy: "scripts/corridor/uncertainty.ts",
        refBundleId: bundle.bundleId,
        uncertaintyDatasetVersion: uncertainty.datasetVersion,
        draws: DRAWS,
        seed: SEED,
        headlineKpi: HEADLINE,
        note:
          "SUMMARY ONLY — the draws are never committed. Every declared range " +
          "is sampled in the same draw, so interactions are in the sample by " +
          "construction; `importance` is a signed Spearman rank correlation " +
          "against the headline KPI, which is the interaction-aware ranking " +
          "neither the sweep nor the elasticity artifact can produce. " +
          "Reproducible from the committed seed: CI regenerates and diffs.",
        kpis: KPIS,
        results,
      },
      null,
      1,
    ) + "\n",
  );
  for (const r of results) {
    const b = r.bands[HEADLINE]!;
    console.log(
      `${r.archetype.key}  P10 ${b.p10.toFixed(1)}  P50 ${b.p50.toFixed(1)}  ` +
        `P90 ${b.p90.toFixed(1)}  (deterministic ${b.deterministic.toFixed(1)})  ` +
        `top: ${r.importance[0]?.id ?? "—"}`,
    );
  }
  console.log(`wrote ${OUT_PATH.pathname.split("/").pop()}`);
}

main();
