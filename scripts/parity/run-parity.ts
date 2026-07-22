/**
 * Chilean 47-project parity run (plan §parity; data/chile-parity/).
 *
 * For every inferred site: resolve pv_fixed + wind_120 TMY profiles through
 * the profile service (Supabase-cached), then sweep PV/wind capacity mixes at
 * a fixed 200 MW total (the doc's default 100+100) with the doc-literal 2022
 * reference defaults (LCOE-priced renewables at 30 USD/MWh, no grid) and keep
 * the best combination — the published table's "best wind+solar combination
 * per site". Writes data/chile-parity/results.json consumed by /parity.
 *
 * Usage: npm run parity:run   (needs apps/web/.env.local incl. SUPABASE_SECRET_KEY)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { REFERENCE_DEFAULTS, simulateLCOH } from "@h2map/lcoh-engine";
import type { LCOHInputs } from "@h2map/lcoh-engine";
import {
  getResourceProfile,
  type BuiltProfile,
  type CachedProfile,
  type ProfileCache,
  type ProfileKind,
  type ResourceProfileResult,
  type TurbineCurve,
} from "@h2map/profile-service";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DATASET_PATH = `${ROOT}data/chile-parity/chile-47-projects-lcoh.json`;
const RESULTS_PATH = `${ROOT}data/chile-parity/results.json`;

/** PV capacity shares of the fixed 200 MW renewable total swept per site. */
const PV_SHARES = [0, 0.25, 0.5, 0.75, 1];
const TOTAL_RENEWABLE_MW = 200;

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

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const raw = readFileSync(`${ROOT}apps/web/.env.local`, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#")) env[m[1]!] = m[2]!;
  }
  return env;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string, attempts = 3): Promise<unknown> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const json = await res.json();
      await delay(500); // politeness toward free provider tiers
      return json;
    } catch (err) {
      lastError = err;
      console.warn(`  retry ${i + 1}/${attempts}: ${String(err)}`);
      await delay(3000 * (i + 1));
    }
  }
  throw lastError;
}

async function main(): Promise<void> {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("apps/web/.env.local is missing Supabase URL/key");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const cache: ProfileCache = {
    async get(latR: number, lonR: number, kind: ProfileKind) {
      const { data, error } = await db
        .from("resource_profiles")
        .select("lat_r, lon_r, kind, provider, dataset_version, cf")
        .eq("lat_r", latR)
        .eq("lon_r", lonR)
        .eq("kind", kind)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        latR: Number(data.lat_r),
        lonR: Number(data.lon_r),
        kind: data.kind as ProfileKind,
        provider: data.provider as string,
        datasetVersion: data.dataset_version as string,
        cf: data.cf as number[],
      } satisfies CachedProfile;
    },
    async put(profile: BuiltProfile) {
      const { error } = await db.from("resource_profiles").upsert(
        {
          lat_r: profile.latR,
          lon_r: profile.lonR,
          kind: profile.kind,
          provider: profile.provider,
          dataset_version: profile.datasetVersion,
          years: `[${profile.yearsUsed[0]},${profile.yearsUsed[1]}]`,
          cf: profile.cf,
        },
        { onConflict: "lat_r,lon_r,kind,dataset_version" },
      );
      if (error) throw new Error(error.message);
    },
  };

  const getTurbineCurve = async (): Promise<TurbineCurve> => {
    const { data, error } = await db
      .from("turbine_curves")
      .select("id, rated_kw, speeds, power_kw")
      .eq("id", "generic-5.6MW")
      .single();
    if (error) throw new Error(error.message);
    return {
      id: data.id as string,
      ratedKw: data.rated_kw as number,
      speedsMs: data.speeds as number[],
      powerKw: data.power_kw as number[],
    };
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
      profiles: Record<string, { provider: string; datasetVersion: string; cacheHit: boolean; meanCf: number }>;
    }
  > = {};

  for (const siteKey of siteKeys) {
    const site = dataset.sites[siteKey]!;
    console.log(`\n=== ${siteKey} (${site.lat}, ${site.lon}) ===`);
    const deps = { fetchJson, cache, getTurbineCurve, log: (m: string) => console.log(`  ${m}`) };
    const pv = await getResourceProfile({ lat: site.lat, lon: site.lon, kind: "pv_fixed" }, deps);
    logProfile("pv_fixed", pv);
    const wind = await getResourceProfile({ lat: site.lat, lon: site.lon, kind: "wind_120" }, deps);
    logProfile("wind_120", wind);

    const sweep: { pvMw: number; windMw: number; lcoh: number }[] = [];
    for (const share of PV_SHARES) {
      const pvMw = TOTAL_RENEWABLE_MW * share;
      const windMw = TOTAL_RENEWABLE_MW - pvMw;
      const inputs: LCOHInputs = {
        finance: { ...REFERENCE_DEFAULTS.finance },
        electrolyzer: { ...REFERENCE_DEFAULTS.electrolyzer },
        ...(pvMw > 0
          ? { pv: { capacityMw: pvMw, pricing: { mode: "lcoe", usdPerMwh: 30 } } }
          : {}),
        ...(windMw > 0
          ? { wind: { capacityMw: windMw, pricing: { mode: "lcoe", usdPerMwh: 30 } } }
          : {}),
        water: { ...REFERENCE_DEFAULTS.water },
      };
      const results = simulateLCOH(inputs, {
        ...(pvMw > 0 ? { pv: pv.cf } : {}),
        ...(windMw > 0 ? { wind: wind.cf } : {}),
      });
      sweep.push({ pvMw, windMw, lcoh: results.lcohUsdPerKg });
    }
    const best = sweep.reduce((a, b) => (b.lcoh < a.lcoh ? b : a));
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
  const spearman = spearmanRho(
    computable.map((p) => p.published_2022),
    computable.map((p) => p.computed_2022),
  );

  const output = {
    generatedAt: new Date().toISOString(),
    method: {
      scenario: "2022 (doc-literal REFERENCE_DEFAULTS: 100 MW electrolyzer, LCOE-priced renewables 30 USD/MWh, no grid)",
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
      publishedColumnMean2022AllProjects: dataset.meta.published_column_means["2022"],
    },
    sites: Object.fromEntries(
      Object.entries(siteResults).map(([k, v]) => [
        k,
        { ...v, lcohUsdPerKg: round3(v.lcohUsdPerKg), sweep: v.sweep.map((s) => ({ ...s, lcoh: round3(s.lcoh) })) },
      ]),
    ),
    projects,
  };
  writeFileSync(RESULTS_PATH, JSON.stringify(output, null, 1) + "\n", "utf8");
  console.log(
    `\nWrote ${RESULTS_PATH}\ncomputed ${computable.length}/${projects.length} projects | mean published ${meanPublished.toFixed(2)} vs computed ${meanComputed.toFixed(2)} | Spearman rho ${spearman.toFixed(3)}`,
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
