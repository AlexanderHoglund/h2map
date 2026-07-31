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
