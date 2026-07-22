import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** GET JSON with retry/backoff — providers are free tiers with fair-use limits. */
export async function fetchJson(
  url: string,
  attempts = 3,
): Promise<unknown> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      }
      return await res.json();
    } catch (err) {
      lastError = err;
      const backoffMs = 2000 * (i + 1);
      console.warn(
        `  retry ${i + 1}/${attempts} after error: ${String(err)} (waiting ${backoffMs} ms)`,
      );
      await delay(backoffMs);
    }
  }
  throw lastError;
}

export async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 1) + "\n", "utf8");
}

export interface SeriesSummary {
  meanCf: number;
  monthlyMeanCf: number[];
  zeroHours: number;
  gapHours: number;
}

const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Summarize an 8760 capacity-factor series; null entries count as gaps (and 0 in means). */
export function summarize(cf: ReadonlyArray<number | null>): SeriesSummary {
  let sum = 0;
  let zeroHours = 0;
  let gapHours = 0;
  const monthlySum = new Array<number>(12).fill(0);
  const monthlyHours = new Array<number>(12).fill(0);
  let month = 0;
  let hoursIntoMonth = 0;
  for (let h = 0; h < cf.length; h++) {
    if (hoursIntoMonth >= DAYS_PER_MONTH[month]! * 24) {
      month++;
      hoursIntoMonth = 0;
    }
    const v = cf[h];
    if (v === null || v === undefined || !Number.isFinite(v)) {
      gapHours++;
    } else {
      sum += v;
      monthlySum[month]! += v;
      if (v === 0) zeroHours++;
    }
    monthlyHours[month]!++;
    hoursIntoMonth++;
  }
  return {
    meanCf: sum / cf.length,
    monthlyMeanCf: monthlySum.map((s, m) =>
      Number((s / monthlyHours[m]!).toFixed(4)),
    ),
    zeroHours,
    gapHours,
  };
}
