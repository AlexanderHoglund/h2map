import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRefBundle } from "../src/ref/bundle";
import { migrateScenarioInput } from "../src/migrate";

const load = (rel: string): unknown =>
  JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));

describe("scenarioInputSchema", () => {
  it("accepts the golden fixture input", () => {
    const parsed = migrateScenarioInput(
      load("../../../fixtures/golden/corridor/excel-baseline.input.json"),
    ).input;
    expect(parsed.cargo.horizonYears).toBe(20);
    // v3 migration: the workbook's `construct` arrives as build-plant with
    // the legacy double-count flag (its benchmark price row was live).
    expect(parsed.green.sourcing).toBe("build-plant");
    expect(parsed.flags?.legacyExcelConstruct).toBe(true);
  });

  it("rejects horizon beyond the workbook's 40-year max", () => {
    const bad = load(
      "../../../fixtures/golden/corridor/excel-baseline.input.json",
    ) as { cargo: { horizonYears: number } };
    bad.cargo.horizonYears = 41;
    expect(() => migrateScenarioInput(bad)).toThrowError();
  });

  it("rejects an unknown sourcing mode", () => {
    const bad = load(
      "../../../fixtures/golden/corridor/excel-baseline.input.json",
    ) as { green: { sourcing: string } };
    bad.green.sourcing = "lease";
    expect(() => migrateScenarioInput(bad)).toThrowError();
  });
});

describe("refBundleSchema", () => {
  it("accepts the committed bundle", () => {
    const bundle = parseRefBundle(load("../../../data/corridor-ref/2026-07-30-excel-v1.json"));
    expect(bundle.vesselTypes).toHaveLength(7);
    expect(bundle.fuels).toHaveLength(6);
    expect(bundle.countries).toHaveLength(7);
    expect(bundle.countries.every((c) => c.verified === false)).toBe(true);
    expect(bundle.schedules.fuelEuTargets.at(-1)).toEqual({ fromCalendarYear: 2050, value: 0.8 });
  });
});
