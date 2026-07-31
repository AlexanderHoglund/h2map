/**
 * Divergence-flag tests (build-plan 1.4): each flag demonstrably changes
 * behaviour when enabled, and the fixture path (flags absent) stays pure
 * Excel — the golden test alongside is the proof of the default.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  calendarYear,
  count,
  eurPerTonne,
  eurUsd,
  fraction,
  gCo2ePerMj,
  mjPerTonne,
  tCo2PerTonne,
  tonnesPerVesselYear,
  usdPerTonne,
} from "@h2map/units";
import {
  migrateScenarioInput,
  parseRefBundle,
  resolveScenario,
  type FuelParams,
  type ScenarioInput,
} from "@h2map/corridor-schema";
import { evaluateScenario } from "../src/index";
import { etsCostUsdM } from "../src/regulation/ets";
import { fuelEuCostUsdM } from "../src/regulation/fuelEu";

const bundle = parseRefBundle(
  JSON.parse(
    readFileSync(
      new URL("../../../data/corridor-ref/2026-07-30-excel-v1.json", import.meta.url),
      "utf8",
    ),
  ),
);
const baseInput = (): ScenarioInput =>
  migrateScenarioInput(
    JSON.parse(
      readFileSync(
        new URL("../../../fixtures/golden/corridor/excel-baseline.input.json", import.meta.url),
        "utf8",
      ),
    ),
  ).input;

const fuel = (over: Partial<Record<keyof FuelParams, number>> = {}): FuelParams => ({
  priceUsdPerTonne: usdPerTonne(over.priceUsdPerTonne ?? 900),
  combustionEf: tCo2PerTonne(over.combustionEf ?? 3),
  lhv: mjPerTonne(over.lhv ?? 41000),
  wtw: gCo2ePerMj(over.wtw ?? 100),
  tonnesPerVesselYear: tonnesPerVesselYear(over.tonnesPerVesselYear ?? 1000),
});

describe("D1 — emissionsBasis", () => {
  it("wellToWake switches the abated basis and surfaces both", () => {
    const excel = evaluateScenario(resolveScenario(baseInput(), bundle));
    const input = baseInput();
    input.flags = { emissionsBasis: "wellToWake" };
    const wtw = evaluateScenario(resolveScenario(input, bundle));

    // WTW abated/yr = (1194.03×40200×92.4 − 2580.65×18600×15)/1e6 t.
    const perYear =
      (1194.0298507462687 * 40200 * 92.4 - 2580.6451612903224 * 18600 * 15) / 1e6;
    expect(wtw.summary.co2AbatedTonnes).toBeCloseTo(perYear * 20, 6);
    expect(wtw.summary.co2AbatedTonnes).not.toBeCloseTo(excel.summary.co2AbatedTonnes, 0);
    // Both bases surfaced; the Excel default result carries no divergences.
    expect(wtw.divergences?.emissionsBasis?.co2AbatedTonnesCombustion).toBeCloseTo(
      excel.summary.co2AbatedTonnes,
      6,
    );
    expect(excel.divergences).toBeUndefined();
    // $/tCO2 follows the selected basis.
    expect(wtw.summary.costPerTonneCo2Usd).toBeCloseTo(
      (wtw.summary.gapPvUsdM * 1e6) / wtw.summary.co2AbatedTonnes,
      9,
    );
  });
});

describe("D2 — fuelEuCredit", () => {
  const params = (withCredit: boolean) => ({
    penaltyEurPerTonne: eurPerTonne(2400),
    eurUsd: eurUsd(1),
    scope: fraction(1),
    baselineGco2PerMj: gCo2ePerMj(91.16),
    vlsfoMjPerTonne: mjPerTonne(41000),
    targets: [{ fromCalendarYear: calendarYear(2025), value: fraction(0.02) }],
    ...(withCredit
      ? {
          credit: {
            surplusValueEurPerTonne: eurPerTonne(1000),
            multiplier: 2, // RFNBO
            multiplierUntil: calendarYear(2033),
          },
        }
      : {}),
  });

  it("compliant fuel earns negative cost (revenue) when enabled; 0 when not", () => {
    const compliant = fuel({ wtw: 15 }); // vs 91.16 baseline → big surplus
    expect(fuelEuCostUsdM(params(false), compliant, count(1), calendarYear(2030))).toBe(0);
    const credited = fuelEuCostUsdM(params(true), compliant, count(1), calendarYear(2030));
    expect(credited).toBeLessThan(0);
  });

  it("RFNBO ×2 applies until 2033, ×1 after", () => {
    const compliant = fuel({ wtw: 15 });
    const in2033 = fuelEuCostUsdM(params(true), compliant, count(1), calendarYear(2033));
    const in2034 = fuelEuCostUsdM(params(true), compliant, count(1), calendarYear(2034));
    // Same target step (2025) both years → surplus identical; only ×2 differs.
    expect(in2033).toBeCloseTo(in2034 * 2, 9);
  });

  it("a deficit fuel still pays the penalty even with credit enabled", () => {
    const dirty = fuel({ wtw: 100 });
    const withCredit = fuelEuCostUsdM(params(true), dirty, count(1), calendarYear(2030));
    const without = fuelEuCostUsdM(params(false), dirty, count(1), calendarYear(2030));
    expect(withCredit).toBe(without);
    expect(withCredit).toBeGreaterThan(0);
  });
});

describe("D3 — etsGasCoverage", () => {
  const base = {
    euaEurPerTonne: eurPerTonne(100),
    eurUsd: eurUsd(1),
    scope: fraction(1),
    phaseIn: [{ fromCalendarYear: calendarYear(2024), value: fraction(1) }],
  };

  it("adds CH4+N2O as CO2e from the coverage start year only", () => {
    const gases = {
      fromCalendarYear: calendarYear(2026),
      ch4TPerTonne: 0.01, // LNG slip scale
      n2oTPerTonne: 0.001,
      gwpCh4: 28,
      gwpN2o: 265,
    };
    const f = fuel({ combustionEf: 2.75 });
    const before = etsCostUsdM({ ...base, gases }, f, count(1), calendarYear(2025));
    const co2Only = etsCostUsdM(base, f, count(1), calendarYear(2025));
    expect(before).toBe(co2Only); // pre-2026: CO2 only even when enabled
    const after = etsCostUsdM({ ...base, gases }, f, count(1), calendarYear(2026));
    // +0.01×28 + 0.001×265 = +0.545 tCO2e/t fuel on top of 2.75.
    expect(after).toBeCloseTo(co2Only * ((2.75 + 0.545) / 2.75), 9);
  });
});

describe("D6 — rateBasis", () => {
  it("real basis removes the OPEX inflation growth", () => {
    const nominal = evaluateScenario(resolveScenario(baseInput(), bundle));
    const input = baseInput();
    input.flags = { rateBasis: "real" };
    const real = evaluateScenario(resolveScenario(input, bundle));
    // Year 1 identical (growth exponent 0); later years cheaper under real.
    expect(real.perYear.green.totalUsdM[0]).toBeCloseTo(nominal.perYear.green.totalUsdM[0]!, 12);
    expect(real.perYear.green.totalUsdM[19]!).toBeLessThan(nominal.perYear.green.totalUsdM[19]!);
    expect(real.summary.greenTotalPvUsdM).toBeLessThan(nominal.summary.greenTotalPvUsdM);
  });
});

describe("D4 — sourcing modes", () => {
  it("named-plant prices at the delivered price with production lines zeroed", () => {
    const input = baseInput();
    input.green.sourcing = "named-plant";
    input.green.deliveredPriceUsdPerTonne = 847;
    const r = resolveScenario(input, bundle);
    expect(r.green.priceUsdPerTonne).toEqual({ value: 847, source: "override" });
    expect(r.green.prodCapexUsdM.value).toBe(0);
    expect(r.green.prodOpexUsdMPerYear.value).toBe(0);
  });

  it("build-here marks the delivered price as derived", () => {
    const input = baseInput();
    input.green.sourcing = "build-here";
    input.green.deliveredPriceUsdPerTonne = 847;
    const r = resolveScenario(input, bundle);
    expect(r.green.priceUsdPerTonne.source).toBe("derived");
    expect(r.green.prodCapexUsdM.value).toBe(0);
  });

  it("delivered modes require the delivered price", () => {
    const input = baseInput();
    input.green.sourcing = "named-plant";
    expect(() => migrateScenarioInput(JSON.parse(JSON.stringify(input)))).toThrowError();
  });

  it("legacy construct keeps the Excel double-count (fixture behaviour)", () => {
    const r = resolveScenario(baseInput(), bundle);
    expect(r.green.priceUsdPerTonne.value).toBe(900); // merchant price
    expect(r.green.prodCapexUsdM.value).toBe(55); // AND production capex
    expect(r.green.prodOpexUsdMPerYear.value).toBe(3); // AND production O&M
  });
});
