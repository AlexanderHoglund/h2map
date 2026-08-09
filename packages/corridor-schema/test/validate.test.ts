import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRefBundle } from "../src/ref/bundle";
import { migrateScenarioInput } from "../src/migrate";
import { parseScenarioInput } from "../src/validate";
import type { ScenarioInput } from "../src/scenario";

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

const fixtureInput = (): ScenarioInput =>
  migrateScenarioInput(
    load("../../../fixtures/golden/corridor/excel-baseline.input.json"),
  ).input;

describe("sea-routing additions (additive, engine-inert)", () => {
  it("accepts portBCoords and an adopted routedDistance", () => {
    const input = fixtureInput();
    input.cargo.portBCoords = { lat: 35.45, lon: 139.65 };
    input.cargo.routedDistance = {
      nm: 9146,
      graphVersion: "searoute-ts@2.2.0/marnet-plus-100km",
      via: null,
    };
    expect(() => parseScenarioInput(input)).not.toThrow();
  });

  it("loads scenarios without them unchanged (absent = legacy)", () => {
    const input = fixtureInput();
    expect(input.cargo.portBCoords).toBeUndefined();
    expect(input.cargo.routedDistance).toBeUndefined();
    expect(() => parseScenarioInput(input)).not.toThrow();
  });

  it("rejects malformed coordinates and empty graph versions", () => {
    const bad = fixtureInput();
    bad.cargo.portBCoords = { lat: 123, lon: 0 };
    expect(() => parseScenarioInput(bad)).toThrow();
    const bad2 = fixtureInput();
    bad2.cargo.routedDistance = { nm: 9146, graphVersion: "", via: null };
    expect(() => parseScenarioInput(bad2)).toThrow();
  });
});
