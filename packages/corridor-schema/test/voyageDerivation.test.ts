import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRefBundle } from "../src/ref/bundle";
import { resolveScenario } from "../src/resolve";
import type { ScenarioInput } from "../src/scenario";
import { migrateScenarioInput } from "../src/migrate";

/**
 * Speed and port days in the consumption derivation.
 *
 *   perRoundTrip = 2 x nm x gjPerNm x (vService / vDesign)^n
 *                + portDays x (portGjPerDay + cargoSystemGjPerDay)
 *
 * Both terms are OPT-IN. The whole design rests on absence being an exact
 * no-op — a scenario written before these inputs existed must compute what
 * it always computed, which is what lets this ship without a schema bump or
 * a migration.
 */

const load = (id: string) =>
  parseRefBundle(
    JSON.parse(
      readFileSync(
        new URL(`../../../data/corridor-ref/${id}.json`, import.meta.url),
        "utf8",
      ),
    ),
  );

const v3 = load("2026-08-17-vessel-v3");

const fixture = () =>
  migrateScenarioInput(
    JSON.parse(
      readFileSync(
        new URL("../../../fixtures/golden/corridor/excel-baseline.input.json", import.meta.url),
        "utf8",
      ),
    ) as unknown,
  ).input;

/** Newcastlemax on GMF's geometry, so the numbers are recognisable. */
const scenario = (edit?: (s: ScenarioInput) => void): ScenarioInput => {
  const s = fixture();
  s.refBundleId = v3.bundleId;
  s.vessel.typeId = "bulk-newcastlemax-210k";
  s.cargo = { ...s.cargo, oneWayDistanceNm: 6166, roundtripsPerYear: 6 };
  s.green.overrides.fuelTonnesPerVesselYear = null;
  edit?.(s);
  return s;
};

const burn = (edit?: (s: ScenarioInput) => void): number =>
  resolveScenario(scenario(edit), v3).green.tonnesPerVesselYear.value as number;

describe("speed correction", () => {
  it("is an exact no-op when the scenario sets no speed", () => {
    // The property the whole opt-in design rests on.
    const withoutInput = burn();
    const atDesignSpeed = burn((s) => {
      s.cargo.serviceSpeedKn = v3.vesselTypes.find(
        (v) => v.id === "bulk-newcastlemax-210k",
      )!.serviceSpeedKn!;
    });
    expect(atDesignSpeed).toBeCloseTo(withoutInput, 9);
  });

  it("scales with the SQUARE of speed, not the cube", () => {
    // Power ~ v^3 so GJ/DAY does, but nm/day ~ v, so GJ/NM ~ v^2. The cube
    // law on a per-nm quantity understates by ~12% at 11.5 vs 13 kn — this
    // test is what stops that error coming back.
    const base = burn();
    const slow = burn((s) => {
      s.cargo.serviceSpeedKn = 11.5;
    });
    expect(slow / base).toBeCloseTo((11.5 / 13) ** 2, 6);
    expect(slow / base).not.toBeCloseTo((11.5 / 13) ** 3, 3);
  });

  it("burns more when faster, less when slower", () => {
    const base = burn();
    expect(burn((s) => (s.cargo.serviceSpeedKn = 16))).toBeGreaterThan(base);
    expect(burn((s) => (s.cargo.serviceSpeedKn = 10))).toBeLessThan(base);
  });

  it("ignores a speed the vessel row cannot interpret", () => {
    // A retired v1 row carries no serviceSpeedKn, so there is no design
    // speed to correct against. Guessing one would invent a number; the
    // correction is skipped instead.
    const s = scenario((x) => {
      x.vessel.typeId = "handymax-bulk-58k";
      x.cargo.serviceSpeedKn = 8;
    });
    const withSpeed = resolveScenario(s, v3).green.tonnesPerVesselYear.value;
    const s2 = scenario((x) => {
      x.vessel.typeId = "handymax-bulk-58k";
    });
    const without = resolveScenario(s2, v3).green.tonnesPerVesselYear.value;
    expect(withSpeed).toBeCloseTo(without as number, 9);
  });
});

describe("port days", () => {
  it("add nothing when the scenario sets none", () => {
    expect(burn((s) => (s.cargo.portDaysPerRoundTrip = 0))).toBeCloseTo(
      burn(),
      9,
    );
  });

  it("burn fuel at zero miles", () => {
    // The term a distance-only formula cannot express at all: GMF's cycle
    // is 24 laden + 7 port + 22 ballast days.
    const base = burn();
    const withPort = burn((s) => (s.cargo.portDaysPerRoundTrip = 7));
    expect(withPort).toBeGreaterThan(base);
    // Linear in the day count.
    const double = burn((s) => (s.cargo.portDaysPerRoundTrip = 14));
    expect(double - base).toBeCloseTo(2 * (withPort - base), 6);
  });

  it("uses port AND cargo-system rates together", () => {
    // A chemical tanker heats its cargo in port; a bulker does not. The two
    // rates are summed, so a heated-cargo ship gains more per port day.
    const chem = (days: number) =>
      resolveScenario(
        scenario((s) => {
          s.vessel.typeId = "chem-imo2-25k";
          s.cargo.portDaysPerRoundTrip = days;
        }),
        v3,
      ).green.tonnesPerVesselYear.value as number;
    const row = v3.vesselTypes.find((v) => v.id === "chem-imo2-25k")!;
    expect(row.cargoSystemGjPerDay!).toBeGreaterThan(0);
    expect(chem(4)).toBeGreaterThan(chem(0));
  });
});

describe("an override still wins over both", () => {
  it("a stated burn ignores speed and port days entirely", () => {
    const stated = burn((s) => {
      s.green.overrides.fuelTonnesPerVesselYear = 12_345;
      s.cargo.serviceSpeedKn = 9;
      s.cargo.portDaysPerRoundTrip = 30;
    });
    expect(stated).toBe(12_345);
  });
});
