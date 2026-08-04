import { fetchJson, summarize } from "./lib/io.js";
import { round4, type ProviderOutput } from "./lib/output.js";
import { crudePvCf } from "./lib/pvCrude.js";
import { SPIKE_YEAR, type Site } from "./sites.js";

interface PvgisSeriesResponse {
  inputs?: {
    meteo_data?: { radiation_db?: string };
  };
  outputs: {
    hourly: Array<{ time: string; P: number }>;
  };
}

interface PvgisTmyResponse {
  outputs: {
    tmy_hourly: Array<Record<string, number | string>>;
  };
}

const ATTRIBUTION =
  "PVGIS (c) European Commission, Joint Research Centre (EC JRC), https://re.jrc.ec.europa.eu/pvg_tools/";

/**
 * Authoritative PV capacity factors: PVGIS's own PV model (seriescalc,
 * pvcalculation=1, 1 kWp, 14 % system loss, optimal fixed angles).
 * With peakpower=1 kWp the hourly P is in W, so CF = P/1000.
 *
 * NOTE — deliberately still `optimalangles=1`, unlike the production provider
 * (`packages/profile-service/src/providers/pvgis.ts`, which now computes an
 * explicit latitude-rule tilt because PVGIS's optimiser is non-physical near
 * the equator). This is the FROZEN one-off provider spike whose output in
 * `data/spike/` feeds the LCOH golden fixtures; re-running it under different
 * mounting would invalidate those goldens. It is an archive, not a live path —
 * do not "fix" it to match.
 */
export async function fetchPvgisSeries(site: Site): Promise<ProviderOutput> {
  const endpoint =
    `https://re.jrc.ec.europa.eu/api/v5_3/seriescalc` +
    `?lat=${site.lat}&lon=${site.lon}` +
    `&startyear=${SPIKE_YEAR}&endyear=${SPIKE_YEAR}` +
    `&pvcalculation=1&peakpower=1&loss=14&optimalangles=1&outputformat=json`;
  const data = (await fetchJson(endpoint)) as PvgisSeriesResponse;

  const rows = data.outputs.hourly;
  if (rows.length !== 8760) {
    throw new Error(
      `pvgis ${site.slug}: expected 8760 hours, got ${rows.length}`,
    );
  }
  const radiationDb = data.inputs?.meteo_data?.radiation_db ?? "unknown";
  const pvCf = rows.map((row) =>
    round4(Number.isFinite(row.P) ? Math.min(1, Math.max(0, row.P / 1000)) : null),
  );

  return {
    meta: {
      site,
      provider: "pvgis-seriescalc",
      endpoint,
      fetchedAt: new Date().toISOString(),
      year: SPIKE_YEAR,
      datasetVersion: `pvgis-5.3/${radiationDb}`,
      notes: [
        `radiation database auto-resolved to: ${radiationDb}`,
        "authoritative PV source of the spike (PVGIS PV model incl. tracking geometry and temperature losses)",
        "timestamps are YYYYMMDD:HHmm UTC",
      ],
      attribution: ATTRIBUTION,
    },
    hourly: { pvCf },
    summary: { pv: summarize(pvCf) },
  };
}

/**
 * PVGIS TMY: months stitched from different historical years. No PV power
 * output on this endpoint — we store the crude GHI proxy for shape checks.
 */
export async function fetchPvgisTmy(site: Site): Promise<ProviderOutput> {
  const endpoint =
    `https://re.jrc.ec.europa.eu/api/v5_3/tmy` +
    `?lat=${site.lat}&lon=${site.lon}&outputformat=json`;
  const data = (await fetchJson(endpoint)) as PvgisTmyResponse;

  const rows = data.outputs.tmy_hourly;
  if (rows.length !== 8760) {
    throw new Error(
      `pvgis-tmy ${site.slug}: expected 8760 hours, got ${rows.length}`,
    );
  }
  const pvCf = rows.map((row) => {
    const ghi = row["G(h)"];
    return round4(crudePvCf(typeof ghi === "number" ? ghi : null));
  });

  return {
    meta: {
      site,
      provider: "pvgis-tmy",
      endpoint,
      fetchedAt: new Date().toISOString(),
      year: "tmy",
      datasetVersion: "pvgis-5.3/tmy",
      notes: [
        "TMY months come from different historical years",
        "pvCf is the CRUDE GHI proxy (no PV model on this endpoint) - shape comparison only",
      ],
      attribution: ATTRIBUTION,
    },
    hourly: { pvCf },
    summary: { pv: summarize(pvCf) },
  };
}
