/**
 * Phase 0 — get the numbers out from behind the colour ramp.
 *
 * Per-cell CSV of the solar-only and wind-only layers with every
 * intermediate the engine exposes: LCOH, all seven decomposition
 * components, capacity factors, electrolyser utilization
 * (E_consumed/E_generated per source), operating vs full-load hours,
 * stack-replacement count, curtailment, and the profile provenance
 * (provider, dataset_version — which carries the PVGIS radiation database
 * and the turbine curve/IEC class — plus the validation verdict).
 *
 * Cache-only: reads the SAME `mode='improved'` rows the live map was built
 * from, never re-fetches. It reproduces `lcohSweep.ts`'s input construction
 * exactly (MAP_FLAGS, COST_PACKS, conditional spreads) and then GATES on
 * that: every row's recomputed solar/wind LCOH is compared against the
 * stored `hex_lcoh` columns, and the run reports the max deviation. A CSV
 * that does not reproduce the map is not evidence about the map.
 *
 *   npm run cells:export -- [--country Indonesia] [--res 3] [--year 2024]
 *   npm run cells:export -- --bbox -10.4,95.2,5.5,141.1 --res 3
 *
 * Writes data/rankdiff/cells-<scope>-res<N>-<year>.csv and prints
 * histograms of solar-only and wind-only LCOH to stdout.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { cellToLatLng } from "h3-js";
import { getResourceProfile } from "@h2map/profile-service";
import {
  simulateLCOH,
  REFERENCE_DEFAULTS,
  type LCOHInputs,
  type LCOHResults,
} from "@h2map/lcoh-engine";
import { COST_PACKS, MAP_FLAGS, type CostYear } from "../lib/lcohSweep";
import {
  fetchJson,
  makeCache,
  makeSupabase,
  makeTurbineLoader,
  ROOT,
} from "../lib/serviceDeps";

/** The sweep's fixed design point: 200 MW renewable on a 100 MW electrolyser. */
const TOTAL_RENEWABLE_MW = 200;

interface Args {
  country?: string;
  bbox?: [number, number, number, number]; // latMin, lonMin, latMax, lonMax
  res: number;
  year: CostYear;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const bboxRaw = get("--bbox");
  const yearRaw = Number(get("--year") ?? 2024);
  if (![2024, 2030, 2040, 2050].includes(yearRaw)) {
    throw new Error(`--year must be one of 2024|2030|2040|2050 (got ${yearRaw})`);
  }
  return {
    country: get("--country"),
    bbox: bboxRaw
      ? (bboxRaw.split(",").map(Number) as [number, number, number, number])
      : undefined,
    res: Number(get("--res") ?? 3),
    year: yearRaw as CostYear,
  };
}

/** Country bounding boxes for the --country shorthand (map scopes only). */
const COUNTRY_BBOX: Record<string, [number, number, number, number]> = {
  indonesia: [-10.4, 95.2, 5.5, 141.1],
  kenya: [-4.7, 33.9, 5.1, 41.9],
  chile: [-56.0, -76.0, -17.5, -66.4],
  namibia: [-28.9, 11.7, -16.9, 25.3],
  australia: [-43.7, 112.9, -10.0, 153.7],
};

/** One layer's engine run, built EXACTLY as scripts/lib/lcohSweep.ts does. */
function runLayer(
  layer: "solar" | "wind",
  cf: readonly number[],
  year: CostYear,
): LCOHResults {
  const pack = COST_PACKS[year];
  const electrolyzer = {
    ...REFERENCE_DEFAULTS.electrolyzer,
    capexUsdPerKw: pack.electrolyzerCapexUsdPerKw,
    efficiencyLhv: pack.efficiencyLhv,
    stackLifetimeHours: pack.stackLifetimeHours,
    degradationPerYear: pack.degradationPerYear,
  };
  const inputs: LCOHInputs = {
    finance: { ...REFERENCE_DEFAULTS.finance },
    electrolyzer,
    ...(layer === "solar"
      ? {
          pv: {
            capacityMw: TOTAL_RENEWABLE_MW,
            pricing: {
              mode: "capex" as const,
              capexUsdPerKw: pack.solarCapexUsdPerKw,
              opexFractionPerYear: pack.solarOpexFrac,
            },
          },
        }
      : {
          wind: {
            capacityMw: TOTAL_RENEWABLE_MW,
            pricing: {
              mode: "capex" as const,
              capexUsdPerKw: pack.windCapexUsdPerKw,
              opexFractionPerYear: pack.windOpexFrac,
            },
          },
        }),
    water: { ...REFERENCE_DEFAULTS.water },
    referenceFlags: MAP_FLAGS,
  };
  return simulateLCOH(
    inputs,
    layer === "solar" ? { pv: cf } : { wind: cf },
  );
}

const mean = (xs: readonly number[]): number =>
  xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const r = (n: number | null | undefined, d = 4): string =>
  n === null || n === undefined || !Number.isFinite(n) ? "" : n.toFixed(d);

/** ASCII histogram over a fixed bin width — the Phase-0 shape question. */
function histogram(label: string, values: number[], binWidth = 0.5): void {
  if (values.length === 0) {
    console.log(`\n${label}: no values`);
    return;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const lo = Math.floor(sorted[0]! / binWidth) * binWidth;
  const hi = Math.ceil(sorted[sorted.length - 1]! / binWidth) * binWidth;
  const bins = new Map<number, number>();
  for (const v of values) {
    const b = Math.floor(v / binWidth) * binWidth;
    bins.set(b, (bins.get(b) ?? 0) + 1);
  }
  const maxCount = Math.max(...bins.values());
  const pct = (p: number) => sorted[Math.floor((sorted.length - 1) * p)]!;
  console.log(
    `\n${label}  n=${values.length}  min ${sorted[0]!.toFixed(2)}  ` +
      `p25 ${pct(0.25).toFixed(2)}  median ${pct(0.5).toFixed(2)}  ` +
      `p75 ${pct(0.75).toFixed(2)}  max ${sorted[sorted.length - 1]!.toFixed(2)}  ` +
      `spread ${(sorted[sorted.length - 1]! - sorted[0]!).toFixed(2)}`,
  );
  for (let b = lo; b <= hi; b += binWidth) {
    const c = bins.get(Number(b.toFixed(6))) ?? bins.get(b) ?? 0;
    const bar = "#".repeat(Math.round((c / maxCount) * 50));
    console.log(`  ${b.toFixed(1).padStart(6)} | ${bar}${c ? ` ${c}` : ""}`);
  }
}

/**
 * Whole-cache provenance census: which radiation database and which wind
 * provider served the map, by latitude band. The decisive artifact for the
 * "is the tropics on a degraded data source?" question — and the answer it
 * gives is a coverage fact, not a quality one (PVGIS v5_3 offers only
 * SARAH3 inside the Meteosat disc and ERA5 everywhere else).
 */
async function coverage(): Promise<void> {
  const db = makeSupabase();
  const rows: { lat_r: number; lon_r: number; kind: string; provider: string; dataset_version: string }[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("resource_profiles")
      .select("lat_r, lon_r, kind, provider, dataset_version")
      .eq("mode", "improved")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as typeof rows));
    if (data.length < PAGE) break;
  }
  const band = (lat: number): string => {
    const a = Math.abs(lat);
    return a < 23.5 ? "tropics (<23.5)" : a < 45 ? "mid (23.5-45)" : a < 60 ? "high (45-60)" : "polar (60+)";
  };
  const radDb = (v: string): string => {
    const m = /^pvgis-5\.3-([a-z0-9-]+?)-pv_/.exec(v);
    return m ? m[1]! : v.split("-").slice(0, 2).join("-");
  };
  const tally = (label: string, pick: (r: (typeof rows)[number]) => string, filter: (r: (typeof rows)[number]) => boolean) => {
    const byKey = new Map<string, { n: number; lat: [number, number]; lon: [number, number] }>();
    const byBand = new Map<string, Map<string, number>>();
    for (const r of rows.filter(filter)) {
      const k = pick(r);
      const cur = byKey.get(k) ?? { n: 0, lat: [Infinity, -Infinity], lon: [Infinity, -Infinity] };
      cur.n += 1;
      cur.lat = [Math.min(cur.lat[0], r.lat_r), Math.max(cur.lat[1], r.lat_r)];
      cur.lon = [Math.min(cur.lon[0], r.lon_r), Math.max(cur.lon[1], r.lon_r)];
      byKey.set(k, cur);
      const b = band(r.lat_r);
      const bm = byBand.get(b) ?? new Map<string, number>();
      bm.set(k, (bm.get(k) ?? 0) + 1);
      byBand.set(b, bm);
    }
    const total = [...byKey.values()].reduce((a, b) => a + b.n, 0);
    console.log(`\n=== ${label} (${total} rows) ===`);
    for (const [k, v] of [...byKey.entries()].sort((a, b) => b[1].n - a[1].n)) {
      console.log(
        `  ${k.padEnd(28)} ${String(v.n).padStart(5)}  ${((v.n / total) * 100).toFixed(1).padStart(5)}%  ` +
          `lat ${v.lat[0].toFixed(1)}..${v.lat[1].toFixed(1)}  lon ${v.lon[0].toFixed(1)}..${v.lon[1].toFixed(1)}`,
      );
    }
    console.log("  by latitude band:");
    for (const [b, bm] of [...byBand.entries()].sort()) {
      const parts = [...bm.entries()].sort((a, b2) => b2[1] - a[1]).map(([k, n]) => `${k} ${n}`);
      console.log(`    ${b.padEnd(18)} ${parts.join(" | ")}`);
    }
  };
  tally("PV radiation database", (r) => radDb(r.dataset_version), (r) => r.kind === "pv_fixed");
  tally("Wind provider", (r) => r.provider, (r) => r.kind.startsWith("wind"));
  tally(
    "Wind dataset (curve / corrections)",
    (r) => r.dataset_version.replace(/^om-era5-\d+-\d+-/, "").replace(/\/tmy-v1$/, ""),
    (r) => r.kind.startsWith("wind"),
  );
}

async function main(): Promise<void> {
  if (process.argv.includes("--coverage")) {
    await coverage();
    return;
  }
  const args = parseArgs();
  const bbox =
    args.bbox ??
    (args.country ? COUNTRY_BBOX[args.country.toLowerCase()] : undefined);
  if (!bbox) {
    throw new Error(
      `pass --bbox latMin,lonMin,latMax,lonMax or --country (${Object.keys(COUNTRY_BBOX).join("|")})`,
    );
  }
  const scope = args.country?.toLowerCase() ?? "bbox";
  const db = makeSupabase();

  // The map's deps: all four improved-mode flags ON, or we would read the
  // reference-mode cache rows and diagnose numbers nobody sees.
  const deps = {
    fetchJson: (() => {
      throw new Error("cache-only: this cell has no cached profile");
    }) as unknown as typeof fetchJson,
    cache: makeCache(db),
    getTurbineCurve: makeTurbineLoader(db),
    windAirDensityCorrection: true,
    windTurbineClassSelection: true,
    pvMaskUnservable: true,
    validateProfiles: true,
  };

  const { data, error } = await db
    .from("hex_lcoh")
    .select(
      "h3,res,lat,lon,status,lcoh_best,lcoh_solar,lcoh_wind,best_pv_mw,best_wind_mw,solar_cf,wind_cf,engine_version,lcoh_wacc,lcoh_optimal",
    )
    .eq("res", args.res)
    .gte("lat", bbox[0])
    .lte("lat", bbox[2])
    .gte("lon", bbox[1])
    .lte("lon", bbox[3]);
  if (error) throw error;
  const cells = data ?? [];
  console.log(
    `${scope} res ${args.res}: ${cells.length} rows, cost year ${args.year}`,
  );

  const header = [
    "h3", "lat", "lon", "status",
    "stored_lcoh_solar", "stored_lcoh_wind", "stored_lcoh_best",
    "solar_lcoh", "wind_lcoh", "lcoh_delta_solar", "lcoh_delta_wind",
    "solar_cf", "wind_cf",
    // seven components, per layer
    ...["solar", "wind"].flatMap((l) => [
      `${l}_c_electricityPv`, `${l}_c_electricityWind`, `${l}_c_electricityGrid`,
      `${l}_c_electrolyzerCapex`, `${l}_c_stackReplacements`,
      `${l}_c_electrolyzerOpex`, `${l}_c_water`,
    ]),
    "solar_util", "wind_util",
    "solar_ely_cf", "wind_ely_cf",
    "solar_flh", "wind_flh",
    "solar_operating_hours", "wind_operating_hours",
    "solar_stack_replacements", "wind_stack_replacements",
    "solar_curtail_frac", "wind_curtail_frac",
    "solar_lcoe_usd_mwh", "wind_lcoe_usd_mwh",
    "solar_lcoe_per_consumed", "wind_lcoe_per_consumed",
    "pv_provider", "pv_dataset_version", "pv_valid", "pv_reasons",
    "wind_provider", "wind_dataset_version", "wind_valid", "wind_reasons",
    "lcoh_wacc_2024", "lcoh_optimal_2024", "optimal_ratio", "optimal_pv_share",
    "engine_version",
  ];
  const rows: string[] = [header.join(",")];
  const solarLcoh: number[] = [];
  const windLcoh: number[] = [];
  let maxDeltaSolar = 0;
  let maxDeltaWind = 0;
  let skipped = 0;

  for (const c of cells) {
    const [lat, lon] = cellToLatLng(c.h3 as string);
    let pvRes = null;
    let windRes = null;
    try {
      pvRes = await getResourceProfile({ lat, lon, kind: "pv_fixed" }, deps);
    } catch {
      /* masked or uncached — recorded as blank */
    }
    try {
      windRes = await getResourceProfile({ lat, lon, kind: "wind_120" }, deps);
    } catch {
      /* masked or uncached */
    }
    if (!pvRes && !windRes) {
      skipped += 1;
      continue;
    }

    const solar = pvRes?.validation.ok ? runLayer("solar", pvRes.cf, args.year) : null;
    const wind = windRes?.validation.ok ? runLayer("wind", windRes.cf, args.year) : null;

    // The gate: recomputed must reproduce what the map stored (2024 only —
    // the stored scalars are the 2024 pack).
    const storedSolar = c.lcoh_solar as number | null;
    const storedWind = c.lcoh_wind as number | null;
    if (args.year === 2024) {
      if (solar && storedSolar != null) {
        maxDeltaSolar = Math.max(maxDeltaSolar, Math.abs(solar.lcohUsdPerKg - storedSolar));
      }
      if (wind && storedWind != null) {
        maxDeltaWind = Math.max(maxDeltaWind, Math.abs(wind.lcohUsdPerKg - storedWind));
      }
    }
    if (solar) solarLcoh.push(solar.lcohUsdPerKg);
    if (wind) windLcoh.push(wind.lcohUsdPerKg);

    const comps = (res: LCOHResults | null) =>
      res
        ? [
            r(res.decomposition.electricityPv),
            r(res.decomposition.electricityWind),
            r(res.decomposition.electricityGrid),
            r(res.decomposition.electrolyzerCapex),
            r(res.decomposition.stackReplacements),
            r(res.decomposition.electrolyzerOpex),
            r(res.decomposition.water),
          ]
        : ["", "", "", "", "", "", ""];
    const curtailFrac = (res: LCOHResults | null, side: "pv" | "wind") => {
      if (!res) return "";
      const consumed = res.annual.reduce(
        (a, y) => a + (side === "pv" ? y.ePvKwh : y.eWindKwh),
        0,
      );
      const curtailed = res.annual.reduce(
        (a, y) => a + (side === "pv" ? y.curtailedPvKwh : y.curtailedWindKwh),
        0,
      );
      const gen = consumed + curtailed;
      return gen > 0 ? r(curtailed / gen) : "";
    };
    const stackCount = (res: LCOHResults | null) =>
      res ? String(res.annual.filter((y) => y.stackReplacement).length) : "";
    const optimal = (c.lcoh_optimal ?? null) as
      | Record<string, { best?: number; ratio?: number; pvShare?: number }>
      | null;
    const waccLayer = (c.lcoh_wacc ?? null) as Record<string, number> | null;

    rows.push(
      [
        c.h3,
        r(lat, 4),
        r(lon, 4),
        c.status,
        r(storedSolar),
        r(storedWind),
        r(c.lcoh_best as number | null),
        r(solar?.lcohUsdPerKg ?? null),
        r(wind?.lcohUsdPerKg ?? null),
        solar && storedSolar != null ? r(solar.lcohUsdPerKg - storedSolar, 6) : "",
        wind && storedWind != null ? r(wind.lcohUsdPerKg - storedWind, 6) : "",
        r(pvRes ? mean(pvRes.cf) : null),
        r(windRes ? mean(windRes.cf) : null),
        ...comps(solar),
        ...comps(wind),
        r(solar?.performance.utilization.pv ?? null),
        r(wind?.performance.utilization.wind ?? null),
        r(solar?.performance.electrolyzerCapacityFactor ?? null),
        r(wind?.performance.electrolyzerCapacityFactor ?? null),
        r(solar?.performance.fullLoadHoursPerYear ?? null, 1),
        r(wind?.performance.fullLoadHoursPerYear ?? null, 1),
        r(solar?.annual[0]?.operatingHours ?? null, 1),
        r(wind?.annual[0]?.operatingHours ?? null, 1),
        stackCount(solar),
        stackCount(wind),
        curtailFrac(solar, "pv"),
        curtailFrac(wind, "wind"),
        r(solar?.lcoe.pv ?? null, 2),
        r(wind?.lcoe.wind ?? null, 2),
        r(solar?.lcoe.effectivePerConsumedMwh ?? null, 2),
        r(wind?.lcoe.effectivePerConsumedMwh ?? null, 2),
        pvRes?.provider ?? "",
        pvRes?.datasetVersion ?? "",
        pvRes ? String(pvRes.validation.ok) : "",
        `"${(pvRes?.validation.reasons ?? []).join("; ")}"`,
        windRes?.provider ?? "",
        windRes?.datasetVersion ?? "",
        windRes ? String(windRes.validation.ok) : "",
        `"${(windRes?.validation.reasons ?? []).join("; ")}"`,
        r(waccLayer?.["2024"] ?? null),
        r(optimal?.["2024"]?.best ?? null),
        r(optimal?.["2024"]?.ratio ?? null, 2),
        r(optimal?.["2024"]?.pvShare ?? null, 3),
        c.engine_version ?? "",
      ].join(","),
    );
  }

  mkdirSync(`${ROOT}data/rankdiff`, { recursive: true });
  const out = `${ROOT}data/rankdiff/cells-${scope}-res${args.res}-${args.year}.csv`;
  writeFileSync(out, rows.join("\n") + "\n", "utf8");

  console.log(
    `\nwrote ${out} (${rows.length - 1} rows, ${skipped} skipped: no cached profile)`,
  );
  if (args.year === 2024) {
    const gateOk = maxDeltaSolar < 0.005 && maxDeltaWind < 0.005;
    console.log(
      `reproduction gate vs stored hex_lcoh: max |Δ| solar ${maxDeltaSolar.toFixed(6)}, ` +
        `wind ${maxDeltaWind.toFixed(6)} → ${gateOk ? "OK" : "MISMATCH — do not trust this CSV"}`,
    );
  }
  histogram("solar-only LCOH (USD/kg)", solarLcoh);
  histogram("wind-only LCOH (USD/kg)", windLcoh);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
