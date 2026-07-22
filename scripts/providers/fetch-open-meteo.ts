import { fetchJson, summarize } from "./lib/io.js";
import { round4, type ProviderOutput } from "./lib/output.js";
import { crudePvCf } from "./lib/pvCrude.js";
import { loadTurbineCurve, windCf } from "./lib/powerCurve.js";
import { shearExponent, toHubHeight } from "./lib/shear.js";
import { SPIKE_YEAR, type Site } from "./sites.js";

interface OpenMeteoResponse {
  hourly: {
    time: string[];
    shortwave_radiation: (number | null)[];
    wind_speed_10m: (number | null)[];
    wind_speed_100m: (number | null)[];
  };
}

export async function fetchOpenMeteo(site: Site): Promise<ProviderOutput> {
  const curve = await loadTurbineCurve();
  const endpoint =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${site.lat}&longitude=${site.lon}` +
    `&start_date=${SPIKE_YEAR}-01-01&end_date=${SPIKE_YEAR}-12-31` +
    `&hourly=shortwave_radiation,direct_normal_irradiance,diffuse_radiation,temperature_2m,wind_speed_10m,wind_speed_100m` +
    `&wind_speed_unit=ms&timezone=UTC`;
  const data = (await fetchJson(endpoint)) as OpenMeteoResponse;

  const n = data.hourly.time.length;
  if (n !== 8760) {
    throw new Error(`open-meteo ${site.slug}: expected 8760 hours, got ${n}`);
  }

  const pvCf: (number | null)[] = [];
  const windSeries: (number | null)[] = [];
  for (let h = 0; h < n; h++) {
    pvCf.push(round4(crudePvCf(data.hourly.shortwave_radiation[h] ?? null)));
    const v10 = data.hourly.wind_speed_10m[h];
    const v100 = data.hourly.wind_speed_100m[h];
    if (v10 == null || v100 == null) {
      windSeries.push(null);
    } else {
      const alpha = shearExponent(v10, 10, v100, 100);
      const v120 = toHubHeight(v100, 100, 120, alpha);
      windSeries.push(round4(windCf(curve, v120)));
    }
  }

  return {
    meta: {
      site,
      provider: "open-meteo",
      endpoint,
      fetchedAt: new Date().toISOString(),
      year: SPIKE_YEAR,
      datasetVersion: "era5-archive-v1",
      notes: [
        "pvCf is a CRUDE horizontal proxy (GHI/1000 x 0.9 PR) for sanity comparison only",
        "windCf: per-hour power-law shear from 10 m/100 m, clamped alpha [0.05, 0.40], to 120 m hub, generic 5.6 MW curve, no air-density correction",
      ],
      attribution:
        "Weather data by Open-Meteo.com (CC BY 4.0), based on ERA5 (Copernicus Climate Change Service)",
    },
    hourly: { pvCf, windCf: windSeries },
    summary: { pv: summarize(pvCf), wind: summarize(windSeries) },
  };
}
