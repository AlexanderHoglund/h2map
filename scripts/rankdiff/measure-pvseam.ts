/**
 * P0 #4 rank measurement — the PVGIS/crude seam. The reference pathway serves PV
 * from PVGIS's auto-resolved DB (SARAH3/NSRDB) and, where PVGIS won't serve,
 * falls back to a categorically different crude GHI proxy — a visible
 * discontinuity. The map pathway drops that crude fallback and masks unservable
 * cells as no-data instead (an earlier revision of #4 pinned PVGIS-ERA5, but
 * that endpoint is broken; auto-resolve is authoritative). This measures the
 * change per cell: for a latitude-spread sample it builds the reference PV (auto
 * PVGIS, or crude where PVGIS fails) and the map PV (auto PVGIS, else masked),
 * holds wind from cache, and diffs LCOH — quantifying the crude-seam removal
 * (cells that lose their crude value to no-data) while auto-resolve cells are
 * byte-identical (zero shift).
 *
 *   npm run rankdiff:pvseam
 */
import { readFileSync } from "node:fs";
import { cellToLatLng } from "h3-js";
import {
  buildTmy,
  fetchOpenMeteoPvCrude,
  fetchPvgisPv,
  fillGaps,
  getResourceProfile,
  HOURS_PER_YEAR,
  type ProviderResult,
} from "@h2map/profile-service";
import { mapSweepAllYears } from "../lib/lcohSweep";
import {
  fetchJson,
  makeCache,
  makeSupabase,
  makeTurbineLoader,
  ROOT,
} from "../lib/serviceDeps";
import { kendallTauB, ranks, round, spearman, type BenchCell } from "./lib";

const HIGH_LAT = 8; // |lat| ≥ 55 — where the seam lives
const MID = 8;
const SOLAR = 4;
const MAX_GAP_HOURS = 0.05 * HOURS_PER_YEAR;

function tmyCf(raw: ProviderResult): number[] {
  const kept = raw.series
    .map((y) => ({ year: y.year, filled: fillGaps(y.cf) }))
    .filter((y) => y.filled.gapHours <= MAX_GAP_HOURS)
    .map((y) => ({ year: y.year, cf: y.filled.cf }));
  if (kept.length === 0) throw new Error("no usable PV years");
  return buildTmy(kept).cf;
}

async function main(): Promise<void> {
  const cells = (
    JSON.parse(readFileSync(`${ROOT}data/rankdiff/benchmark.json`, "utf8")) as {
      cells: BenchCell[];
    }
  ).cells;

  const highLat = cells
    .filter((c) => Math.abs(c.lat) >= 55)
    .sort((a, b) => Math.abs(b.lat) - Math.abs(a.lat))
    .slice(0, HIGH_LAT);
  const solar = [...cells]
    .filter((c) => (c.solarCf ?? 0) >= 0.22)
    .sort((a, b) => (b.solarCf ?? 0) - (a.solarCf ?? 0))
    .slice(0, SOLAR);
  const mid = cells
    .filter((c) => Math.abs(c.lat) < 45 && !solar.includes(c))
    .slice(0, MID);
  const sample = [...highLat, ...mid, ...solar];

  const db = makeSupabase();
  const windDeps = { fetchJson, cache: makeCache(db), getTurbineCurve: makeTurbineLoader(db), log: () => {} };

  const rows: {
    cell: BenchCell;
    refSrc: string;
    refBest: number;
    candBest: number | null;
    refPv: number | null;
    candPv: number | null;
  }[] = [];
  let masked = 0;

  for (const cell of sample) {
    const [lat, lon] = cellToLatLng(cell.h3);
    try {
      const wind = await getResourceProfile({ lat, lon, kind: "wind_120" }, windDeps);

      // Current pathway: auto-resolved PVGIS, or crude where PVGIS won't serve.
      let refPvCf: number[];
      let refSrc: string;
      try {
        refPvCf = tmyCf(await fetchPvgisPv(fetchJson, lat, lon, "pv_fixed"));
        refSrc = "pvgis-auto";
      } catch {
        refPvCf = tmyCf(await fetchOpenMeteoPvCrude(fetchJson, lat, lon));
        refSrc = "crude";
      }

      // Map pathway: auto-resolve only; failure ⇒ masked no-data (no crude).
      // Auto-resolve cells are identical to the reference auto-resolve above, so
      // their diff is zero by construction; only crude cells change (→ masked).
      let candPvCf: number[] | null;
      try {
        candPvCf = tmyCf(await fetchPvgisPv(fetchJson, lat, lon, "pv_fixed"));
      } catch {
        candPvCf = null;
        masked++;
      }

      const ref = mapSweepAllYears({ pv: refPvCf, wind: wind.cf })[2024];
      const cand = candPvCf ? mapSweepAllYears({ pv: candPvCf, wind: wind.cf })[2024] : null;
      rows.push({
        cell,
        refSrc,
        refBest: ref.best,
        candBest: cand?.best ?? null,
        refPv: ref.solar,
        candPv: cand?.solar ?? null,
      });
      console.log(
        `  lat ${round(cell.lat, 1)} ${refSrc}: pv ${round(ref.solar ?? NaN, 2)} → ${cand ? round(cand.solar ?? NaN, 2) : "MASKED"}  best ${round(ref.best, 2)} → ${cand ? round(cand.best, 2) : "MASKED"}`,
      );
    } catch (err) {
      console.warn(`  skip ${cell.h3}: ${String(err)}`);
    }
  }

  const paired = rows.filter((r) => r.candBest != null);
  const crude = paired.filter((r) => r.refSrc === "crude");
  const pvgis = paired.filter((r) => r.refSrc === "pvgis-auto");
  const mean = (rs: typeof paired, sel: (r: (typeof paired)[number]) => number) =>
    rs.length ? round(rs.reduce((a, r) => a + sel(r), 0) / rs.length, 3) : NaN;
  const dBest = (r: (typeof paired)[number]) => (r.candBest as number) - r.refBest;
  const dPv = (r: (typeof paired)[number]) => (r.candPv as number) - (r.refPv as number);

  console.log("\n=== P0 #4 PVGIS/crude-seam rank measurement ===");
  console.log(`sample: ${rows.length} cells · ${crude.length} were crude, ${pvgis.length} PVGIS-auto, ${masked} masked (no crude)`);
  console.log(
    `crude-seam removal (best):  ${mean(crude, dBest)} USD/kg  (pv ${mean(crude, dPv)})  — crude value dropped to no-data`,
  );
  console.log(
    `PVGIS auto-resolve (best):  ${mean(pvgis, dBest)} USD/kg  (pv ${mean(pvgis, dPv)})  — unchanged (same DB), expect ~0`,
  );
  const rb = paired.map((r) => r.refBest);
  const cb = paired.map((r) => r.candBest as number);
  console.log(
    `sample rank stability (best 2024): Spearman ρ ${round(spearman(rb, cb), 4)} · Kendall τ_b ${round(kendallTauB(ranks(rb), ranks(cb)), 4)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
