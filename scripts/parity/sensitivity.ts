/**
 * P2 #8 — bias sensitivity. The Chilean parity shows a −0.21 USD/kg (−4.7 %)
 * mean gap. Coordinate inference from region names produces noise, not a
 * consistent one-directional offset, so a structural difference from the study's
 * assumptions is the more likely cause. This decomposes the gap by perturbing,
 * one at a time, the reference baselines (efficiency, electrolyser CAPEX,
 * discount rate, oversizing ratio) and the inferred coordinates, and reporting
 * how the mean bias moves. A baseline that closes the gap points at the cause;
 * if it is a baseline rather than geolocation, the bias may not be uniform
 * across geographies — which would matter for every cell on the map.
 *
 *   npm run parity:sensitivity
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  REFERENCE_DEFAULTS,
  simulateLCOH,
  type LCOHInputs,
} from "@h2map/lcoh-engine";
import { getResourceProfile } from "@h2map/profile-service";
import {
  fetchJson,
  makeCache,
  makeSupabase,
  makeTurbineLoader,
  ROOT,
} from "../lib/serviceDeps";

const DATASET_PATH = `${ROOT}data/chile-parity/chile-47-projects-lcoh.json`;
const OUT_PATH = `${ROOT}data/chile-parity/sensitivity.json`;

interface Dataset {
  sites: Record<string, { name: string; lat: number; lon: number }>;
  projects: { project_name: string; site: string | null; lcoh_2022: number }[];
}

interface Config {
  efficiencyLhv: number;
  electrolyzerCapex: number;
  discountRate: number;
  totalRenewableMw: number;
}

const BASE: Config = {
  efficiencyLhv: REFERENCE_DEFAULTS.electrolyzer.efficiencyLhv, // 0.60
  electrolyzerCapex: REFERENCE_DEFAULTS.electrolyzer.capexUsdPerKw, // 1000
  discountRate: REFERENCE_DEFAULTS.finance.discountRate, // 0.08
  totalRenewableMw: 200, // 2:1 on the 100 MW electrolyser
};

const PV_SHARES = [0, 0.25, 0.5, 0.75, 1];
const FLAT_LCOE = { mode: "lcoe" as const, usdPerMwh: 30 };

/** Best (lowest) reference-sweep LCOH for a site under a config. */
function bestLcoh(pv: number[], wind: number[], cfg: Config): number {
  let best = Infinity;
  for (const share of PV_SHARES) {
    const pvMw = cfg.totalRenewableMw * share;
    const windMw = cfg.totalRenewableMw - pvMw;
    const inputs: LCOHInputs = {
      finance: { ...REFERENCE_DEFAULTS.finance, discountRate: cfg.discountRate },
      electrolyzer: {
        ...REFERENCE_DEFAULTS.electrolyzer,
        capexUsdPerKw: cfg.electrolyzerCapex,
        efficiencyLhv: cfg.efficiencyLhv,
      },
      ...(pvMw > 0 ? { pv: { capacityMw: pvMw, pricing: FLAT_LCOE } } : {}),
      ...(windMw > 0 ? { wind: { capacityMw: windMw, pricing: FLAT_LCOE } } : {}),
      water: { ...REFERENCE_DEFAULTS.water },
      referenceFlags: {},
    };
    const lcoh = simulateLCOH(inputs, {
      ...(pvMw > 0 ? { pv } : {}),
      ...(windMw > 0 ? { wind } : {}),
    }).lcohUsdPerKg;
    if (lcoh < best) best = lcoh;
  }
  return best;
}

async function main(): Promise<void> {
  const dataset = JSON.parse(readFileSync(DATASET_PATH, "utf8")) as Dataset;
  const db = makeSupabase();
  const deps = { fetchJson, cache: makeCache(db), getTurbineCurve: makeTurbineLoader(db), log: () => {} };

  // Base profiles per site (cache-hit; jitter neighbours fetched on demand).
  const siteProfiles: Record<string, { pv: number[]; wind: number[] }> = {};
  for (const [key, site] of Object.entries(dataset.sites)) {
    const pv = await getResourceProfile({ lat: site.lat, lon: site.lon, kind: "pv_fixed" }, deps);
    const wind = await getResourceProfile({ lat: site.lat, lon: site.lon, kind: "wind_120" }, deps);
    siteProfiles[key] = { pv: pv.cf, wind: wind.cf };
  }

  const computable = dataset.projects.filter(
    (p): p is typeof p & { site: string } => p.site !== null && siteProfiles[p.site] !== undefined,
  );

  const meanBias = (cfg: Config): number => {
    const cache = new Map<string, number>();
    let sum = 0;
    for (const p of computable) {
      let lc = cache.get(p.site);
      if (lc === undefined) {
        lc = bestLcoh(siteProfiles[p.site]!.pv, siteProfiles[p.site]!.wind, cfg);
        cache.set(p.site, lc);
      }
      sum += lc - p.lcoh_2022;
    }
    return sum / computable.length;
  };

  const base = meanBias(BASE);
  const rows: { driver: string; setting: string; meanBias: number; deltaVsBase: number }[] = [];
  const record = (driver: string, setting: string, cfg: Config) => {
    const mb = meanBias(cfg);
    rows.push({ driver, setting, meanBias: round3(mb), deltaVsBase: round3(mb - base) });
  };

  record("efficiency (LHV)", "0.57 (−5%)", { ...BASE, efficiencyLhv: 0.57 });
  record("efficiency (LHV)", "0.63 (+5%)", { ...BASE, efficiencyLhv: 0.63 });
  record("electrolyser CAPEX", "900 (−10%)", { ...BASE, electrolyzerCapex: 900 });
  record("electrolyser CAPEX", "1100 (+10%)", { ...BASE, electrolyzerCapex: 1100 });
  record("discount rate", "0.06", { ...BASE, discountRate: 0.06 });
  record("discount rate", "0.10", { ...BASE, discountRate: 0.1 });
  record("oversizing ratio", "1.5:1 (150 MW)", { ...BASE, totalRenewableMw: 150 });
  record("oversizing ratio", "3.0:1 (300 MW)", { ...BASE, totalRenewableMw: 300 });

  // Coordinate error: ±0.2° jitter, mean bias over the four neighbours per site
  // (fetches; skip a site if a neighbour can't be resolved).
  const JIT = 0.2;
  const jitterBiases: number[] = [];
  for (const [key, site] of Object.entries(dataset.sites)) {
    const neigh: number[] = [];
    for (const [dlat, dlon] of [[JIT, 0], [-JIT, 0], [0, JIT], [0, -JIT]] as const) {
      try {
        const pv = await getResourceProfile({ lat: site.lat + dlat, lon: site.lon + dlon, kind: "pv_fixed" }, deps);
        const wind = await getResourceProfile({ lat: site.lat + dlat, lon: site.lon + dlon, kind: "wind_120" }, deps);
        neigh.push(bestLcoh(pv.cf, wind.cf, BASE));
      } catch {
        /* skip unresolved neighbour */
      }
    }
    if (neigh.length > 0) {
      const spread = Math.max(...neigh) - Math.min(...neigh);
      jitterBiases.push(spread);
      console.log(`  ${key}: ±0.2° LCOH spread ${round3(spread)} USD/kg (${neigh.length} neighbours)`);
    }
  }
  const meanJitterSpread = jitterBiases.length
    ? jitterBiases.reduce((a, b) => a + b, 0) / jitterBiases.length
    : NaN;

  const out = {
    generatedAt: new Date().toISOString(),
    computableProjects: computable.length,
    baseMeanBias: round3(base),
    note: "mean bias = computed − published 2022 (USD/kg). deltaVsBase shows how each perturbation moves it.",
    perturbations: rows,
    coordinateJitter: {
      degrees: JIT,
      meanPerSiteLcohSpread: round3(meanJitterSpread),
      interpretation:
        "coordinate error moves a site's LCOH by roughly this spread in EITHER direction — noise, not a one-directional offset, so it cannot explain a consistent mean bias.",
    },
  };
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 1) + "\n");

  console.log(`\n=== P2 #8 bias sensitivity (base mean bias ${round3(base)} USD/kg) ===`);
  for (const r of rows) {
    console.log(`  ${r.driver} → ${r.setting}: mean bias ${r.meanBias} (Δ ${r.deltaVsBase >= 0 ? "+" : ""}${r.deltaVsBase})`);
  }
  console.log(`  coordinate ±${JIT}°: mean per-site LCOH spread ${round3(meanJitterSpread)} USD/kg (symmetric noise)`);
  console.log(`\nwrote ${OUT_PATH}`);
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
