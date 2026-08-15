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
  /** Newest-first, as the DB adapter returns them. */
  preloadedRows: CachedProfile[] = [];
  getCalls = 0;
  getModes: (ProfileMode | undefined)[] = [];

  /** Back-compat single-row setter used by the older cases. */
  set preloaded(row: CachedProfile | null) {
    this.preloadedRows = row ? [row] : [];
  }

  get(
    _latR: number,
    _lonR: number,
    _kind: ProfileKind,
    mode?: ProfileMode,
    accept?: (datasetVersion: string, provider: string) => boolean,
  ): Promise<CachedProfile | null> {
    this.getCalls++;
    this.getModes.push(mode);
    // Mirrors the real adapters: scan newest-first, return the first row the
    // caller recognises as the current generation.
    const row = this.preloadedRows.find(
      (r) => !accept || accept(r.datasetVersion, r.provider),
    );
    return Promise.resolve(row ?? null);
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

  it("mask mode serves auto-resolved PVGIS and never pins ERA5 or uses the crude proxy", async () => {
    const urls: string[] = [];
    const result = await getResourceProfile(
      { lat: 68.5, lon: 27.0, kind: "pv_fixed" },
      {
        pvMaskUnservable: true,
        fetchJson: (url) => {
          urls.push(url);
          if (!url.includes("re.jrc.ec.europa.eu")) {
            throw new Error("crude fallback must not exist in mask mode");
          }
          return Promise.resolve(pvgisResponse());
        },
      },
    );
    expect(result.provider).toBe("pvgis-seriescalc");
    // Auto-resolve: PVGIS picks the DB, so we never send raddatabase=PVGIS-ERA5.
    expect(urls.every((u) => !u.includes("raddatabase="))).toBe(true);
    expect(result.datasetVersion).toContain("pvgis-sarah3");
  });

  it("mask mode holes out (no crude fallback) when PVGIS is down", async () => {
    await expect(
      getResourceProfile(
        { lat: 0.26, lon: 39.93, kind: "pv_fixed" },
        {
          pvMaskUnservable: true,
          fetchJson: (url) => {
            if (url.includes("re.jrc.ec.europa.eu")) {
              return Promise.reject(new Error("HTTP 500"));
            }
            throw new Error("crude fallback must not be reached in mask mode");
          },
        },
      ),
    ).rejects.toThrowError(ProfileServiceError);
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
    // Improved/mask PV (pvMaskUnservable): also auto-resolves — SAME DB and thus
    // SAME dataset_version — but tagged mode improved.
    await getResourceProfile(
      { lat: -24.2, lon: -69.1, kind: "pv_fixed" },
      {
        cache,
        pvMaskUnservable: true,
        fetchJson: () => Promise.resolve(pvgisWith("PVGIS-SARAH3")),
      },
    );
    expect(cache.getModes).toEqual(["reference", "improved"]);
    expect(cache.rows.map((r) => r.mode)).toEqual(["reference", "improved"]);
    // Same dataset_version now (both auto-resolve): the rows coexist only because
    // `mode` is part of the cache unique key (migration
    // 20260729000001_resource_profiles_mode_unique).
    expect(new Set(cache.rows.map((r) => r.datasetVersion)).size).toBe(1);
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

  it("attaches a validation verdict but does not enforce it by default", async () => {
    // pvgisResponse is a flat 0.25 profile — non-physical (peak 0.25 < floor).
    const result = await getResourceProfile(
      { lat: -24.2, lon: -69.1, kind: "pv_fixed" },
      { fetchJson: () => Promise.resolve(pvgisResponse()) },
    );
    expect(result.provider).toBe("pvgis-seriescalc");
    expect(result.validation.ok).toBe(false);
    expect(result.validation.reasons.some((r) => r.includes("peak CF"))).toBe(true);
  });

  it("masks a non-physical profile when validateProfiles is enforced", async () => {
    // Mask mode + enforcement: the only provider yields a non-physical profile,
    // so the request throws → the caller renders no-data instead of a colour.
    await expect(
      getResourceProfile(
        { lat: 0.5, lon: 37.3, kind: "pv_fixed" },
        {
          pvMaskUnservable: true,
          validateProfiles: true,
          fetchJson: (url) => {
            if (url.includes("re.jrc.ec.europa.eu")) {
              return Promise.resolve(pvgisResponse());
            }
            throw new Error("no crude fallback in mask mode");
          },
        },
      ),
    ).rejects.toThrowError(ProfileServiceError);
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

  // --- cache generation (the mixed-mounting defect) ------------------------
  // A coordinate accumulates one cached row per model generation, keyed on
  // dataset_version. Serving the NEWEST row unconditionally meant profiles
  // built under the pre-fix PV mounting (PVGIS's tilt optimiser, which
  // returns non-physical geometry near the equator) were served forever, so
  // one map ran on two mounting assumptions at once.

  it("PV: a stale-mounting cached row MISSES and is refetched", async () => {
    const cache = new MemoryCache();
    cache.preloadedRows = [
      {
        latR: -8.5,
        lonR: 118.6,
        kind: "pv_fixed",
        provider: "pvgis-seriescalc",
        // No -tilt tag: the pre-mounting-rule generation.
        datasetVersion: "pvgis-5.3-pvgis-era5-pv_fixed-2014-2023/tmy-v1",
        cf: new Array<number>(HOURS_PER_YEAR).fill(0.09),
      },
    ];
    let fetched = false;
    const result = await getResourceProfile(
      { lat: -8.45, lon: 118.57, kind: "pv_fixed" },
      {
        fetchJson: () => {
          fetched = true;
          return Promise.resolve(pvgisResponse());
        },
        cache,
        pvMaskUnservable: true,
      },
    );
    expect(fetched).toBe(true);
    expect(result.cacheHit).toBe(false);
    // 8 deg south -> tilt 8, equator-facing azimuth 180.
    expect(result.datasetVersion).toContain("-tilt8a180-");
  });

  it("PV: the CURRENT-generation row hits, even behind a stale one", async () => {
    const cache = new MemoryCache();
    cache.preloadedRows = [
      {
        latR: -8.5,
        lonR: 118.6,
        kind: "pv_fixed",
        provider: "pvgis-seriescalc",
        datasetVersion: "pvgis-5.3-pvgis-era5-pv_fixed-2014-2023/tmy-v1",
        cf: new Array<number>(HOURS_PER_YEAR).fill(0.09),
      },
      {
        latR: -8.5,
        lonR: 118.6,
        kind: "pv_fixed",
        provider: "pvgis-seriescalc",
        datasetVersion:
          "pvgis-5.3-pvgis-era5-pv_fixed-tilt8a180-2014-2023/tmy-v1",
        cf: new Array<number>(HOURS_PER_YEAR).fill(0.19),
      },
    ];
    const result = await getResourceProfile(
      { lat: -8.45, lon: 118.57, kind: "pv_fixed" },
      {
        fetchJson: () => {
          throw new Error("providers must not be called: a current row exists");
        },
        cache,
        pvMaskUnservable: true,
      },
    );
    expect(result.cacheHit).toBe(true);
    expect(result.cf[0]).toBe(0.19);
  });

  it("PV map mode: a retired crude-provider row MISSES", async () => {
    const cache = new MemoryCache();
    cache.preloadedRows = [
      {
        latR: 0,
        lonR: 0,
        kind: "pv_fixed",
        // The improved chain is PVGIS-only; this row can no longer be
        // produced and must not be served as if it could.
        provider: "open-meteo-crude",
        datasetVersion: "om-era5-ghi-2015-2024/tmy-v1",
        cf: new Array<number>(HOURS_PER_YEAR).fill(0.15),
      },
    ];
    let fetched = false;
    await getResourceProfile(
      { lat: 0, lon: 0, kind: "pv_fixed" },
      {
        fetchJson: () => {
          fetched = true;
          return Promise.resolve(pvgisResponse());
        },
        cache,
        pvMaskUnservable: true,
      },
    );
    expect(fetched).toBe(true);
  });

  it("wind: any generation still hits (the class is chosen after fetching)", async () => {
    const cache = new MemoryCache();
    cache.preloadedRows = [
      {
        latR: -52.5,
        lonR: -70.9,
        kind: "wind_120",
        provider: "open-meteo",
        datasetVersion: "om-era5-2015-2024-hub120-generic-5.6MW/tmy-v1",
        cf: new Array<number>(HOURS_PER_YEAR).fill(0.42),
      },
    ];
    const result = await getResourceProfile(
      { lat: -52.47, lon: -70.93, kind: "wind_120" },
      {
        fetchJson: () => {
          throw new Error("providers must not be called on a wind cache hit");
        },
        cache,
        getTurbineCurve: () => Promise.resolve(curve),
        windAirDensityCorrection: true,
        windTurbineClassSelection: true,
      },
    );
    expect(result.cacheHit).toBe(true);
    expect(result.cf[0]).toBe(0.42);
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
