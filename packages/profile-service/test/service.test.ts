import { describe, expect, it } from "vitest";
import {
  COORD_STEP,
  getResourceProfile,
  quantizeCoord,
} from "../src/service";
import { HOURS_PER_YEAR, isLeapYear } from "../src/time";
import type {
  BuiltProfile,
  CachedProfile,
  ProfileCache,
  ProfileKind,
  ProfileMode,
  TurbineCurve,
} from "../src/types";
import { ProfileServiceError } from "../src/types";

const curve: TurbineCurve = {
  id: "test-1MW",
  ratedKw: 1000,
  speedsMs: [3, 12, 25],
  powerKw: [100, 1000, 1000],
};

function hours(year: number): number {
  return isLeapYear(year) ? 8784 : 8760;
}

/** Canned Open-Meteo archive response for whatever year the URL asks for. */
function openMeteoResponse(url: string): unknown {
  const year = Number(new URL(url).searchParams.get("start_date")!.slice(0, 4));
  const n = hours(year);
  const hourly: Record<string, unknown> = {
    time: new Array(n).fill("t"),
  };
  if (url.includes("wind_speed_10m")) {
    hourly.wind_speed_10m = new Array(n).fill(7);
    hourly.wind_speed_100m = new Array(n).fill(9);
  }
  if (url.includes("shortwave_radiation")) {
    hourly.shortwave_radiation = new Array(n).fill(500);
  }
  return { hourly };
}

/** Canned PVGIS seriescalc response with two complete years. */
function pvgisResponse(): unknown {
  const rows: { time: string; P: number }[] = [];
  for (const year of [2019, 2020]) {
    for (let h = 0; h < hours(year); h++) {
      rows.push({ time: `${year}0101:0010`, P: 250 });
    }
  }
  return {
    inputs: { meteo_data: { radiation_db: "PVGIS-SARAH3" } },
    outputs: { hourly: rows },
  };
}

class MemoryCache implements ProfileCache {
  rows: BuiltProfile[] = [];
  preloaded: CachedProfile | null = null;
  getCalls = 0;
  getModes: (ProfileMode | undefined)[] = [];

  get(
    _latR: number,
    _lonR: number,
    _kind: ProfileKind,
    mode?: ProfileMode,
  ): Promise<CachedProfile | null> {
    this.getCalls++;
    this.getModes.push(mode);
    return Promise.resolve(this.preloaded);
  }

  put(profile: BuiltProfile): Promise<void> {
    this.rows.push(profile);
    return Promise.resolve();
  }
}

describe("quantizeCoord", () => {
  it("snaps to the step grid with 4-decimal precision", () => {
    expect(quantizeCoord(-52.47)).toBeCloseTo(-52.5, 10);
    expect(quantizeCoord(13.44)).toBeCloseTo(13.4, 10);
    expect(quantizeCoord(0.05)).toBeCloseTo(0.1, 10);
    expect(Math.abs(quantizeCoord(51.9501) - 52.0)).toBeLessThan(COORD_STEP);
  });
});

describe("getResourceProfile", () => {
  it("builds a wind TMY from Open-Meteo and caches it", async () => {
    const cache = new MemoryCache();
    const urls: string[] = [];
    const result = await getResourceProfile(
      { lat: -52.47, lon: -70.93, kind: "wind_120" },
      {
        fetchJson: (url) => {
          urls.push(url);
          if (!url.includes("archive-api.open-meteo.com")) {
            throw new Error(`unexpected URL ${url}`);
          }
          return Promise.resolve(openMeteoResponse(url));
        },
        cache,
        getTurbineCurve: () => Promise.resolve(curve),
      },
    );

    expect(result.provider).toBe("open-meteo");
    expect(result.cacheHit).toBe(false);
    expect(result.latR).toBeCloseTo(-52.5, 10);
    expect(result.lonR).toBeCloseTo(-70.9, 10);
    expect(result.cf).toHaveLength(HOURS_PER_YEAR);
    expect(result.cf.every((v) => v >= 0 && v <= 1)).toBe(true);
    // Constant wind everywhere → every hour identical, no gaps.
    expect(new Set(result.cf).size).toBe(1);
    expect(result.build?.gapHours).toBe(0);
    expect(result.build?.yearsUsed).toEqual([2015, 2024]);
    expect(result.datasetVersion).toMatch(/^om-era5-2015-2024-hub120-test-1MW\/tmy-v1$/);
    expect(cache.rows).toHaveLength(1);
    expect(urls).toHaveLength(10);
  });

  it("returns the cached profile without touching providers", async () => {
    const cache = new MemoryCache();
    cache.preloaded = {
      latR: -52.5,
      lonR: -70.9,
      kind: "wind_120",
      provider: "open-meteo",
      datasetVersion: "om-era5-2015-2024-hub120-test-1MW/tmy-v1",
      cf: new Array<number>(HOURS_PER_YEAR).fill(0.5),
    };
    const result = await getResourceProfile(
      { lat: -52.47, lon: -70.93, kind: "wind_120" },
      {
        fetchJson: () => {
          throw new Error("providers must not be called on a cache hit");
        },
        cache,
        getTurbineCurve: () => Promise.resolve(curve),
      },
    );
    expect(result.cacheHit).toBe(true);
    expect(result.cf[0]).toBe(0.5);
    expect(result.attribution).toMatch(/Open-Meteo/);
  });

  it("falls back to NASA POWER when Open-Meteo fails", async () => {
    const result = await getResourceProfile(
      { lat: -26.6, lon: 15.2, kind: "wind_160" },
      {
        fetchJson: (url) => {
          if (url.includes("open-meteo")) {
            return Promise.reject(new Error("HTTP 429"));
          }
          const year = Number(
            new URL(url).searchParams.get("start")!.slice(0, 4),
          );
          const ws50: Record<string, number> = {};
          const daysPerMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
          for (let m = 0; m < 12; m++) {
            for (let d = 1; d <= daysPerMonth[m]!; d++) {
              for (let h = 0; h < 24; h++) {
                const key = `${year}${String(m + 1).padStart(2, "0")}${String(d).padStart(2, "0")}${String(h).padStart(2, "0")}`;
                ws50[key] = 8;
              }
            }
          }
          return Promise.resolve({ properties: { parameter: { WS50M: ws50 } } });
        },
        getTurbineCurve: () => Promise.resolve(curve),
      },
    );
    expect(result.provider).toBe("nasa-power");
    expect(result.cf).toHaveLength(HOURS_PER_YEAR);
    expect(result.datasetVersion).toContain("hub160");
  });

  it("serves PV from PVGIS with the crude proxy as fallback only", async () => {
    const result = await getResourceProfile(
      { lat: -24.2, lon: -69.1, kind: "pv_fixed" },
      { fetchJson: (url) => {
          if (!url.includes("re.jrc.ec.europa.eu")) {
            throw new Error("crude fallback must not be used when PVGIS works");
          }
          return Promise.resolve(pvgisResponse());
        } },
    );
    expect(result.provider).toBe("pvgis-seriescalc");
    expect(result.cf.every((v) => v === 0.25)).toBe(true);
    expect(result.build?.yearsUsed).toEqual([2019, 2020]);
    expect(result.datasetVersion).toContain("pvgis-sarah3");
  });

  it("falls back to the crude PV proxy when PVGIS fails", async () => {
    const result = await getResourceProfile(
      { lat: 55.7, lon: 13.4, kind: "pv_fixed" },
      { fetchJson: (url) => {
          if (url.includes("re.jrc.ec.europa.eu")) {
            return Promise.reject(new Error("HTTP 529"));
          }
          return Promise.resolve(openMeteoResponse(url));
        } },
    );
    expect(result.provider).toBe("open-meteo-crude");
    // 500 W/m² × 0.9 / 1000 = 0.45 everywhere.
    expect(result.cf.every((v) => v === 0.45)).toBe(true);
  });

  it("unified-ERA5 mode pins PVGIS to ERA5 and never uses the crude proxy", async () => {
    const urls: string[] = [];
    const result = await getResourceProfile(
      { lat: 68.5, lon: 27.0, kind: "pv_fixed" },
      {
        pvUnifiedEra5: true,
        fetchJson: (url) => {
          urls.push(url);
          if (!url.includes("re.jrc.ec.europa.eu")) {
            throw new Error("crude fallback must not exist in unified-ERA5 mode");
          }
          return Promise.resolve({
            inputs: { meteo_data: { radiation_db: "PVGIS-ERA5" } },
            outputs: (pvgisResponse() as { outputs: unknown }).outputs,
          });
        },
      },
    );
    expect(result.provider).toBe("pvgis-seriescalc");
    expect(urls.every((u) => u.includes("raddatabase=PVGIS-ERA5"))).toBe(true);
    expect(result.datasetVersion).toContain("pvgis-era5");
  });

  it("tags profiles reference vs improved so both coexist per coordinate", async () => {
    const cache = new MemoryCache();
    const pvgisWith = (radDb: string) => ({
      inputs: { meteo_data: { radiation_db: radDb } },
      outputs: (pvgisResponse() as { outputs: unknown }).outputs,
    });
    // Reference PV (no improved flags): auto-resolved DB, mode reference.
    await getResourceProfile(
      { lat: -24.2, lon: -69.1, kind: "pv_fixed" },
      { cache, fetchJson: () => Promise.resolve(pvgisWith("PVGIS-SARAH3")) },
    );
    // Improved PV (pvUnifiedEra5): pinned ERA5, mode improved.
    await getResourceProfile(
      { lat: -24.2, lon: -69.1, kind: "pv_fixed" },
      {
        cache,
        pvUnifiedEra5: true,
        fetchJson: () => Promise.resolve(pvgisWith("PVGIS-ERA5")),
      },
    );
    expect(cache.getModes).toEqual(["reference", "improved"]);
    expect(cache.rows.map((r) => r.mode)).toEqual(["reference", "improved"]);
    // Distinct dataset versions → both rows survive in a real (unique-keyed) cache.
    expect(new Set(cache.rows.map((r) => r.datasetVersion)).size).toBe(2);
  });

  it("wind improved flags don't mislabel a PV request's mode", async () => {
    const cache = new MemoryCache();
    // A PV request with only WIND improved flags set is still reference PV.
    await getResourceProfile(
      { lat: -24.2, lon: -69.1, kind: "pv_fixed" },
      {
        cache,
        windAirDensityCorrection: true,
        windTurbineClassSelection: true,
        fetchJson: () =>
          Promise.resolve({
            inputs: { meteo_data: { radiation_db: "PVGIS-SARAH3" } },
            outputs: (pvgisResponse() as { outputs: unknown }).outputs,
          }),
      },
    );
    expect(cache.getModes).toEqual(["reference"]);
    expect(cache.rows[0]!.mode).toBe("reference");
  });

  it("unified-ERA5 mode masks as no-data when PVGIS fails (no crude fallback)", async () => {
    await expect(
      getResourceProfile(
        { lat: 78.0, lon: 15.0, kind: "pv_fixed" },
        {
          pvUnifiedEra5: true,
          fetchJson: (url) => {
            if (url.includes("archive-api.open-meteo.com")) {
              throw new Error("crude fallback must not be reached");
            }
            return Promise.reject(new Error("HTTP 400 out of coverage"));
          },
        },
      ),
    ).rejects.toThrow(ProfileServiceError);
  });

  it("throws ProfileServiceError with per-provider causes when everything fails", async () => {
    await expect(
      getResourceProfile(
        { lat: 0, lon: 0, kind: "pv_fixed" },
        { fetchJson: () => Promise.reject(new Error("network down")) },
      ),
    ).rejects.toThrowError(ProfileServiceError);

    try {
      await getResourceProfile(
        { lat: 0, lon: 0, kind: "pv_fixed" },
        { fetchJson: () => Promise.reject(new Error("network down")) },
      );
    } catch (err) {
      const e = err as ProfileServiceError;
      expect(e.causes.map((c) => c.provider)).toEqual([
        "pvgis-seriescalc",
        "open-meteo-crude",
      ]);
    }
  });

  it("requires a turbine curve for wind kinds", async () => {
    await expect(
      getResourceProfile(
        { lat: 0, lon: 0, kind: "wind_120" as ProfileKind },
        { fetchJson: () => Promise.resolve({}) },
      ),
    ).rejects.toThrow(/requires getTurbineCurve/);
  });
});
