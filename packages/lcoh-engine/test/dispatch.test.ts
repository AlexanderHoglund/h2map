import { describe, expect, it } from "vitest";
import { HOURS_PER_YEAR } from "../src/constants";
import { dispatchYear } from "../src/dispatch";
import { constantProfile, expectRel } from "./helpers";

const KW = 1000;

describe("dispatchYear", () => {
  it("consumes renewables fully when availability is below capacity", () => {
    const r = dispatchYear({
      electrolyzerKw: 100 * KW,
      pvKw: 100 * KW,
      windKw: 0,
      gridMaxKw: 0,
      pvProfile: constantProfile(0.5),
      windProfile: null,
    });
    expectRel(r.pvConsumedKwh, 0.5 * 100 * KW * HOURS_PER_YEAR, 1e-12);
    expect(r.curtailedPvKwh).toBe(0);
    expect(r.gridKwh).toBe(0);
    expect(r.operatingHours).toBe(HOURS_PER_YEAR);
  });

  it("splits pro-rata and curtails when combined availability exceeds capacity", () => {
    const r = dispatchYear({
      electrolyzerKw: 100 * KW,
      pvKw: 100 * KW,
      windKw: 100 * KW,
      gridMaxKw: 0,
      pvProfile: constantProfile(0.8),
      windProfile: constantProfile(0.6),
    });
    // avail = 140 MW, s = 100/140; consumed shares keep the 80:60 ratio
    expectRel(r.pvConsumedKwh, (100 / 140) * 80 * KW * HOURS_PER_YEAR, 1e-9);
    expectRel(r.windConsumedKwh, (100 / 140) * 60 * KW * HOURS_PER_YEAR, 1e-9);
    expectRel(r.consumedKwh, 100 * KW * HOURS_PER_YEAR, 1e-9);
    // per-source closure: generated = consumed + curtailed
    expectRel(
      r.pvGeneratedKwh,
      r.pvConsumedKwh + r.curtailedPvKwh,
      1e-12,
    );
    expectRel(
      r.windGeneratedKwh,
      r.windConsumedKwh + r.curtailedWindKwh,
      1e-12,
    );
  });

  it("tops up from the grid only up to its hourly cap", () => {
    const r = dispatchYear({
      electrolyzerKw: 100 * KW,
      pvKw: 100 * KW,
      windKw: 0,
      gridMaxKw: 40 * KW,
      pvProfile: constantProfile(0.3),
      windProfile: null,
    });
    // shortfall is 70 MW every hour; grid delivers its 40 MW cap
    expectRel(r.gridKwh, 40 * KW * HOURS_PER_YEAR, 1e-12);
    expectRel(r.consumedKwh, 70 * KW * HOURS_PER_YEAR, 1e-12);
  });

  it("counts zero-availability hours as non-operating without grid", () => {
    const half = Array.from({ length: HOURS_PER_YEAR }, (_, h) =>
      h % 2 === 0 ? 0.5 : 0,
    );
    const r = dispatchYear({
      electrolyzerKw: 100 * KW,
      pvKw: 100 * KW,
      windKw: 0,
      gridMaxKw: 0,
      pvProfile: half,
      windProfile: null,
    });
    expect(r.operatingHours).toBe(HOURS_PER_YEAR / 2);
  });
});
