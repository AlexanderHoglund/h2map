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
 *
 * Re-measured 2026-08-21 on 2026-08-21-cruise-v6: verified-v5 benchmarks +
 * inflation default 0.023 (docs/corridor/research/verification-apply-sheet-v5.md).
 * Verification moved the Newcastlemax design speed 13 -> 11.3 kn and zeroed
 * every catalogue cargoSystemGjPerDay (heating folded into portGjPerDay).
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

const v3 = load("2026-08-21-cruise-v6");

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
    // law on a per-nm quantity misstates the burn (~1.8% at 11.5 vs the
    // verified 11.3 kn design speed) — this test is what stops that error
    // coming back.
    const design = v3.vesselTypes.find(
      (v) => v.id === "bulk-newcastlemax-210k",
    )!.serviceSpeedKn!;
    const base = burn();
    const adjusted = burn((s) => {
      s.cargo.serviceSpeedKn = 11.5;
    });
    expect(adjusted / base).toBeCloseTo((11.5 / design) ** 2, 6);
    expect(adjusted / base).not.toBeCloseTo((11.5 / design) ** 3, 3);
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
    // The verified catalogue folds the heating load into portGjPerDay and
    // zeroes cargoSystemGjPerDay on every row, so the summation is exercised
    // on a copy of the live row with the pre-verification rate restored.
    const heated = {
      ...v3,
      vesselTypes: v3.vesselTypes.map((v) =>
        v.id === "chem-imo2-25k" ? { ...v, cargoSystemGjPerDay: 160.8 } : v,
      ),
    };
    const chem = (days: number, b = heated) =>
      resolveScenario(
        scenario((s) => {
          s.vessel.typeId = "chem-imo2-25k";
          s.cargo.portDaysPerRoundTrip = days;
        }),
        b,
      ).green.tonnesPerVesselYear.value as number;
    const row = heated.vesselTypes.find((v) => v.id === "chem-imo2-25k")!;
    expect(row.cargoSystemGjPerDay!).toBeGreaterThan(0);
    expect(chem(4)).toBeGreaterThan(chem(0));
    // ...and the cargo-system rate itself is what makes the difference.
    expect(chem(4)).toBeGreaterThan(chem(4, v3));
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
