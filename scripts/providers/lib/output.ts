import type { Site } from "../sites.js";
import type { SeriesSummary } from "./io.js";

export interface ProviderOutput {
  meta: {
    site: Site;
    provider: string;
    endpoint: string;
    fetchedAt: string;
    year: number | "tmy";
    datasetVersion: string;
    notes: string[];
    attribution: string;
  };
  hourly: {
    pvCf?: (number | null)[];
    windCf?: (number | null)[];
  };
  summary: {
    pv?: SeriesSummary;
    wind?: SeriesSummary;
  };
}

export function round4(v: number | null): number | null {
  return v === null ? null : Number(v.toFixed(4));
}
