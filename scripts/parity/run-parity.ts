/**
 * Chilean 47-project parity run (plan §parity; data/chile-parity/).
 *
 * For every inferred site: resolve pv_fixed + wind_120 TMY profiles through
 * the profile service (Supabase-cached), then run the shared reference sweep
 * (scripts/lib/lcohSweep.ts — doc-literal 2022 defaults, best PV/wind mix of
 * a 200 MW total) and keep the best combination — the published table's
 * "best wind+solar combination per site". Writes
 * data/chile-parity/results.json consumed by /parity.
 *
 * Usage: npm run parity:run   (needs apps/web/.env.local incl. SUPABASE_SECRET_KEY)
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  getResourceProfile,
  type ResourceProfileResult,
} from "@h2map/profile-service";
import { PV_SHARES, referenceSweep, TOTAL_RENEWABLE_MW } from "../lib/lcohSweep";
import {
  kendallTauBWithCI,
  precisionAtK,
  topDecileRetention,
} from "../lib/screeningMetrics";
import {
  fetchJson,
  makeCache,
  makeSupabase,
  makeTurbineLoader,
  ROOT,
} from "../lib/serviceDeps";

const DATASET_PATH = `${ROOT}data/chile-parity/chile-47-projects-lcoh.json`;
const RESULTS_PATH = `${ROOT}data/chile-parity/results.json`;

interface Dataset {
  meta: { published_column_means: Record<string, number> };
  sites: Record<string, { name: string; lat: number; lon: number }>;
  projects: {
    project_name: string;
    region_hint: string;
    site: string | null;
    lcoh_2022: number;
    lcoh_2030: number;
    lcoh_2040: number;
    lcoh_2050: number;
  }[];
}

async function main(): Promise<void> {
  const db = makeSupabase();
  const deps = {
    fetchJson,
    cache: makeCache(db),
    getTurbineCurve: makeTurbineLoader(db),
    log: (m: string) => console.log(`  ${m}`),
  };

  const dataset = JSON.parse(readFileSync(DATASET_PATH, "utf8")) as Dataset;
  const siteKeys = Object.keys(dataset.sites);
  console.log(`${dataset.projects.length} projects, ${siteKeys.length} sites`);

  const siteResults: Record<
    string,
    {
      bestPvMw: number;
      bestWindMw: number;
      lcohUsdPerKg: number;
      sweep: { pvMw: number; windMw: number; lcoh: number }[];
      profiles: Record<
        string,
        { provider: string; datasetVersion: string; cacheHit: boolean; meanCf: number }
      >;
    }
  > = {};

  for (const siteKey of siteKeys) {
    const site = dataset.sites[siteKey]!;
    console.log(`\n=== ${siteKey} (${site.lat}, ${site.lon}) ===`);
    const pv = await getResourceProfile(
      { lat: site.lat, lon: site.lon, kind: "pv_fixed" },
      deps,
    );
    logProfile("pv_fixed", pv);
    const wind = await getResourceProfile(
      { lat: site.lat, lon: site.lon, kind: "wind_120" },
      deps,
    );
    logProfile("wind_120", wind);

    const { best, sweep } = referenceSweep({ pv: pv.cf, wind: wind.cf });
    console.log(
      `  best: pv ${best.pvMw} MW + wind ${best.windMw} MW -> ${best.lcoh.toFixed(3)} USD/kg`,
    );
    siteResults[siteKey] = {
      bestPvMw: best.pvMw,
      bestWindMw: best.windMw,
      lcohUsdPerKg: best.lcoh,
      sweep,
      profiles: {
        pv_fixed: profileMeta(pv),
        wind_120: profileMeta(wind),
      },
    };
  }

  const projects = dataset.projects.map((p) => ({
    project_name: p.project_name,
    site: p.site,
    published_2022: p.lcoh_2022,
    computed_2022: p.site ? round3(siteResults[p.site]!.lcohUsdPerKg) : null,
    delta: p.site ? round3(siteResults[p.site]!.lcohUsdPerKg - p.lcoh_2022) : null,
  }));

  const computable = projects.filter(
    (p): p is typeof p & { computed_2022: number } => p.computed_2022 !== null,
  );
  const meanPublished = mean(computable.map((p) => p.published_2022));
  const meanComputed = mean(computable.map((p) => p.computed_2022));
  const pub = computable.map((p) => p.published_2022);
  const comp = computable.map((p) => p.computed_2022);
  const spearman = spearmanRho(pub, comp);
  // Screening metrics: how well the model preserves the shortlist a user acts
  // on (cheapest-k sites), not just the global correlation.
  const tau = kendallTauBWithCI(pub, comp);
  const screening = {
    kendallTauB: round3(tau.tau),
    kendallTauB_ci95: tau.ci95.map(round3) as [number, number],
    precisionAt5: round3(precisionAtK(pub, comp, 5)),
    precisionAt10: round3(precisionAtK(pub, comp, 10)),
    topDecileRetention: round3(topDecileRetention(pub, comp)),
  };

  const output = {
    generatedAt: new Date().toISOString(),
    method: {
      scenario:
        "Published column: 2022. Engine basis: REFERENCE_DEFAULTS on the IEA GHR 2025 (2024) cost vintage — 100 MW electrolyzer at 2300 USD/kW, LCOE-priced renewables 30 USD/MWh, no grid. VINTAGE MISMATCH: the level comparison is not like-for-like (see docs/PARITY_NOTES.md); the rank metrics are the meaningful signal.",
      sweep: `pv share of ${TOTAL_RENEWABLE_MW} MW total in [${PV_SHARES.join(", ")}], best combination kept`,
      caveat:
        "Site coordinates are inferred from region hints (not published); projects without a hint are excluded. Site-level LCOH is shared by all projects at that site.",
    },
    summary: {
      projectsTotal: projects.length,
      projectsComputed: computable.length,
      meanPublished2022: round3(meanPublished),
      meanComputed2022: round3(meanComputed),
      meanDelta: round3(meanComputed - meanPublished),
      spearmanRho: round3(spearman),
      ...screening,
      publishedColumnMean2022AllProjects: dataset.meta.published_column_means["2022"],
    },
    sites: Object.fromEntries(
      Object.entries(siteResults).map(([k, v]) => [
        k,
        {
          ...v,
          lcohUsdPerKg: round3(v.lcohUsdPerKg),
          sweep: v.sweep.map((s) => ({ ...s, lcoh: round3(s.lcoh) })),
        },
      ]),
    ),
    projects,
  };
  writeFileSync(RESULTS_PATH, JSON.stringify(output, null, 1) + "\n", "utf8");
  console.log(
    `\nWrote ${RESULTS_PATH}\ncomputed ${computable.length}/${projects.length} projects | mean published ${meanPublished.toFixed(2)} vs computed ${meanComputed.toFixed(2)} | Spearman rho ${spearman.toFixed(3)}`,
  );
  console.log(
    `screening: Kendall tau_b ${screening.kendallTauB} [${screening.kendallTauB_ci95[0]}, ${screening.kendallTauB_ci95[1]}] | P@5 ${screening.precisionAt5} | P@10 ${screening.precisionAt10} | top-decile ${screening.topDecileRetention}`,
  );
}

function logProfile(kind: string, p: ResourceProfileResult): void {
  const meanCf = p.cf.reduce((a, b) => a + b, 0) / p.cf.length;
  console.log(
    `  ${kind}: ${p.provider} ${p.datasetVersion} cacheHit=${p.cacheHit} meanCf=${meanCf.toFixed(3)}`,
  );
}

function profileMeta(p: ResourceProfileResult): {
  provider: string;
  datasetVersion: string;
  cacheHit: boolean;
  meanCf: number;
} {
  return {
    provider: p.provider,
    datasetVersion: p.datasetVersion,
    cacheHit: p.cacheHit,
    meanCf: Number((p.cf.reduce((a, b) => a + b, 0) / p.cf.length).toFixed(4)),
  };
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/** Spearman rank correlation with average ranks for ties. */
function spearmanRho(a: number[], b: number[]): number {
  const ra = averageRanks(a);
  const rb = averageRanks(b);
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let dbb = 0;
  for (let i = 0; i < ra.length; i++) {
    const xa = ra[i]! - ma;
    const xb = rb[i]! - mb;
    num += xa * xb;
    da += xa * xa;
    dbb += xb * xb;
  }
  return num / Math.sqrt(da * dbb);
}

function averageRanks(xs: number[]): number[] {
  const indexed = xs.map((x, i) => ({ x, i })).sort((p, q) => p.x - q.x);
  const ranks = new Array<number>(xs.length);
  let k = 0;
  while (k < indexed.length) {
    let j = k;
    while (j + 1 < indexed.length && indexed[j + 1]!.x === indexed[k]!.x) j++;
    const avg = (k + j) / 2 + 1;
    for (let m = k; m <= j; m++) ranks[indexed[m]!.i] = avg;
    k = j + 1;
  }
  return ranks;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
