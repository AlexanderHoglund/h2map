import { fetchJson, summarize } from "./lib/io.js";
import { round4, type ProviderOutput } from "./lib/output.js";
import { crudePvCf } from "./lib/pvCrude.js";
import { loadTurbineCurve, windCf } from "./lib/powerCurve.js";
import { DEFAULT_ALPHA, toHubHeight } from "./lib/shear.js";
import { SPIKE_YEAR, type Site } from "./sites.js";

interface NasaPowerResponse {
  properties: {
    parameter: {
      ALLSKY_SFC_SW_DWN?: Record<string, number>;
      WS50M?: Record<string, number>;
    };
  };
}

/** NASA POWER uses -999 as its fill value. */
function clean(v: number | undefined): number | null {
  return v === undefined || v <= -900 || !Number.isFinite(v) ? null : v;
}

export async function fetchNasaPower(site: Site): Promise<ProviderOutput> {
  const curve = await loadTurbineCurve();
  const endpoint =
    `https://power.larc.nasa.gov/api/temporal/hourly/point` +
    `?parameters=ALLSKY_SFC_SW_DWN,WS10M,WS50M,T2M&community=RE` +
    `&latitude=${site.lat}&longitude=${site.lon}` +
    `&start=${SPIKE_YEAR}0101&end=${SPIKE_YEAR}1231` +
    `&format=JSON&time-standard=utc`;
  const data = (await fetchJson(endpoint)) as NasaPowerResponse;

  const ghiByHour = data.properties.parameter.ALLSKY_SFC_SW_DWN ?? {};
  const ws50ByHour = data.properties.parameter.WS50M ?? {};
  const keys = Object.keys(ghiByHour).sort();
  if (keys.length !== 8760) {
    throw new Error(
      `nasa-power ${site.slug}: expected 8760 hours, got ${keys.length}`,
    );
  }

  const pvCf: (number | null)[] = [];
  const windSeries: (number | null)[] = [];
  for (const key of keys) {
    pvCf.push(round4(crudePvCf(clean(ghiByHour[key]))));
    const v50 = clean(ws50ByHour[key]);
    windSeries.push(
      v50 === null
        ? null
        : round4(windCf(curve, toHubHeight(v50, 50, 120, DEFAULT_ALPHA))),
    );
  }

  return {
    meta: {
      site,
      provider: "nasa-power",
      endpoint,
      fetchedAt: new Date().toISOString(),
      year: SPIKE_YEAR,
      datasetVersion: "merra2-hourly-v2",
      notes: [
        "pvCf is a CRUDE horizontal proxy (GHI/1000 x 0.9 PR) for sanity comparison only",
        `windCf: WS50M extrapolated to 120 m with fixed alpha=1/7, generic 5.6 MW curve, no air-density correction`,
      ],
      attribution:
        "Data obtained from the NASA Langley Research Center POWER Project, funded through the NASA Earth Science Directorate Applied Science Program",
    },
    hourly: { pvCf, windCf: windSeries },
    summary: { pv: summarize(pvCf), wind: summarize(windSeries) },
  };
}
