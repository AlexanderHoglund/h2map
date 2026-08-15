/**
 * Migration machinery test (build-plan 4.1): a scenario saved at
 * schemaVersion N loads at N+1 via a REAL migration — proven with the frozen
 * v1 golden fixture and the v1→v2 rename
 * (regulation.ira45z.rateUsdPerGallon → creditUsdPerGallon).
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrateScenarioInput } from "../src/migrate";
import { SCHEMA_VERSION } from "../src/scenario";

const v1Fixture = (): Record<string, unknown> =>
  JSON.parse(
    readFileSync(
      new URL("../../../fixtures/golden/corridor/excel-baseline.input.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, unknown>;

describe("migrateScenarioInput", () => {
  it("loads the frozen v1 fixture at the current version", () => {
    const raw = v1Fixture();
    expect(raw.schemaVersion).toBe(1); // the fixture is frozen — never edited
    const { input, migratedFrom } = migrateScenarioInput(raw);
    expect(input.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migratedFrom).toBe(1);
    // v6 auto-upgrade: refined emission accounting is INJECTED (default
    // FuelEU) — the deliberate behaviour-changing migration.
    expect(input.regulation.emissions).toEqual({ framework: "fueleu" });
  });

  it("v1→v2 carries the renamed 45Z field value across", () => {
    const raw = v1Fixture();
    (raw.regulation as { ira45z: Record<string, unknown> }).ira45z = {
      enabled: true,
      usProduced: true,
      rateUsdPerGallon: 1.75, // old name
    };
    const { input } = migrateScenarioInput(raw);
    expect(input.regulation.ira45z.creditUsdPerGallon).toBe(1.75);
    expect("rateUsdPerGallon" in input.regulation.ira45z).toBe(false);
  });

  it("a current-version payload passes through unmigrated", () => {
    const { input } = migrateScenarioInput(v1Fixture());
    const again = migrateScenarioInput(JSON.parse(JSON.stringify(input)));
    expect(again.migratedFrom).toBeNull();
    expect(again.input).toEqual(input);
  });

  it("rejects unknown and future versions loudly", () => {
    const raw = v1Fixture();
    raw.schemaVersion = 99;
    expect(() => migrateScenarioInput(raw)).toThrowError(/unsupported/);
    raw.schemaVersion = 0;
    expect(() => migrateScenarioInput(raw)).toThrowError(/unsupported/);
    delete raw.schemaVersion;
    expect(() => migrateScenarioInput(raw)).toThrowError(/unsupported/);
  });

  it("migration is value-preserving for the golden path (same resolved gap)", async () => {
    // The golden test itself is the strong form of this; here just assert the
    // migrated fixture still validates and keeps the workbook defaults.
    const { input } = migrateScenarioInput(v1Fixture());
    expect(input.cargo.oneWayDistanceNm).toBe(500);
    expect(input.green.fuelId).toBe("e-ammonia");
    expect(input.regulation.ira45z.creditUsdPerGallon).toBe(1);
  });
});

/**
 * v6 → v7: the derived-value layer.
 *
 * The acceptance bar the change was specified against is NUMERICAL
 * IDENTITY — every scenario must recompute to the same numbers after
 * migration. These assert the two mechanisms that make that true, and the
 * engine-side golden and Chilean-calibration tests assert the numbers
 * themselves at their own tolerances.
 */
describe("v6 → v7 derived-value migration", () => {
  /** A v6 payload, built from the frozen fixture migrated to v6 and rewound. */
  const v6Payload = (
    edit: (raw: Record<string, unknown>) => void,
  ): Record<string, unknown> => {
    const { input } = migrateScenarioInput(v1Fixture());
    const raw = JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
    // Rewind the v7 shape back to v6 so the migration under test runs.
    const vessel = raw.vessel as Record<string, unknown>;
    for (const side of ["green", "fossil"] as const) {
      const s = vessel[side] as Record<string, unknown>;
      s.capexUsdM = s.capexUsdMPerShip;
      s.opexUsdMPerYear = s.opexUsdMPerShipPerYear;
      delete s.capexUsdMPerShip;
      delete s.opexUsdMPerShipPerYear;
    }
    vessel.consumptionMode = "distance";
    raw.schemaVersion = 6;
    edit(raw);
    return raw;
  };

  it("freezes a vessel-benchmark burn as an explicit override", () => {
    // tanker-35k's flat figure is 2400 t/vessel/yr. The scenario was burning
    // exactly that, so it must still burn exactly that — now visibly, as an
    // override with the derived value shown beneath it.
    const raw = v6Payload((r) => {
      (r.vessel as Record<string, unknown>).consumptionMode = "vessel-benchmark";
      (r.vessel as Record<string, unknown>).typeId = "tanker-35k";
    });
    const { input } = migrateScenarioInput(raw);
    expect(input.green.overrides.fuelTonnesPerVesselYear).toBe(2400);
    expect(input.fossil.overrides.fuelTonnesPerVesselYear).toBe(2400);
    expect(input.flags?.migratedVesselBenchmarkBurn).toBe(true);
  });

  it("leaves a distance-mode scenario's burn on the derived chain", () => {
    const raw = v6Payload(() => {});
    const { input } = migrateScenarioInput(raw);
    // Untouched: null means "derive", which is what distance mode did.
    expect(input.green.overrides.fuelTonnesPerVesselYear).toBeNull();
    expect(input.fossil.overrides.fuelTonnesPerVesselYear).toBeNull();
    expect(input.flags?.migratedVesselBenchmarkBurn).toBeUndefined();
  });

  it("does not disturb an override that was already set", () => {
    // An explicit burn governed under BOTH modes, so it must survive
    // untouched — the migration must not overwrite it with the flat figure.
    const raw = v6Payload((r) => {
      (r.vessel as Record<string, unknown>).consumptionMode = "vessel-benchmark";
      const g = r.green as { overrides: Record<string, unknown> };
      g.overrides.fuelTonnesPerVesselYear = 1234;
    });
    const { input } = migrateScenarioInput(raw);
    expect(input.green.overrides.fuelTonnesPerVesselYear).toBe(1234);
  });

  it("divides stored fleet vessel costs into per-ship figures", () => {
    const raw = v6Payload((r) => {
      (r.cargo as Record<string, unknown>).vessels = 10;
      const v = r.vessel as Record<string, Record<string, unknown>>;
      v.green!.capexUsdM = 440;
      v.green!.opexUsdMPerYear = 32;
      v.fossil!.capexUsdM = 350;
      v.fossil!.opexUsdMPerYear = 28;
    });
    const { input } = migrateScenarioInput(raw);
    expect(input.vessel.green.capexUsdMPerShip).toBe(44);
    expect(input.vessel.green.opexUsdMPerShipPerYear).toBe(3.2);
    expect(input.vessel.fossil.capexUsdMPerShip).toBe(35);
    expect(input.vessel.fossil.opexUsdMPerShipPerYear).toBe(2.8);
  });

  it("keeps null as null — the benchmark marker, now correctly per-ship", () => {
    // This is the case the change EXISTS to fix: a null meant "use the
    // benchmark", and the benchmark was always per-ship while the field was
    // a fleet total. Dividing a null would be meaningless; it stays null and
    // now resolves against a matching dimension.
    const raw = v6Payload((r) => {
      (r.cargo as Record<string, unknown>).vessels = 10;
      const v = r.vessel as Record<string, Record<string, unknown>>;
      v.green!.capexUsdM = null;
      v.green!.opexUsdMPerYear = null;
    });
    const { input } = migrateScenarioInput(raw);
    expect(input.vessel.green.capexUsdMPerShip).toBeNull();
    expect(input.vessel.green.opexUsdMPerShipPerYear).toBeNull();
  });

  it("guards a zero vessel count rather than dividing to Infinity", () => {
    const raw = v6Payload((r) => {
      (r.cargo as Record<string, unknown>).vessels = 0;
      (r.vessel as Record<string, Record<string, unknown>>).green!.capexUsdM = 44;
    });
    // vessels=0 fails validation downstream, but the migration must not
    // produce Infinity on the way there.
    expect(() => migrateScenarioInput(raw)).toThrow();
  });

  it("removes consumptionMode from the migrated payload", () => {
    const raw = v6Payload(() => {});
    const { input } = migrateScenarioInput(raw);
    expect("consumptionMode" in input.vessel).toBe(false);
  });

  it("refuses to guess a burn for an unknown vessel type", () => {
    // Silently dropping to the derived chain would CHANGE the numbers, which
    // is the one thing this migration must never do.
    const raw = v6Payload((r) => {
      (r.vessel as Record<string, unknown>).consumptionMode = "vessel-benchmark";
      (r.vessel as Record<string, unknown>).typeId = "no-such-hull";
    });
    expect(() => migrateScenarioInput(raw)).toThrowError(/unknown vessel type/);
  });
});
