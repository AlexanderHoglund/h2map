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


/** Minimal evaluated build-here site: components sum to 55 capex / 3 opex. */
const testBuildHereSite = () => ({
  h3: "85e2000000000000",
  lat: -22.35,
  lon: -69.66,
  evaluated: {
    lcohUsdPerKg: 4.2,
    annualH2Kg: 10_000_000,
    capitalUsd: 40_000_000,
    annualOperatingUsd: 2_000_000,
    lcohDiscountRate: 0.08,
    lcohEngineVersion: "0.1.0",
    plantLifeYears: 20,
  },
  components: {
    h2Capital: { derivedUsdM: 40, overrideUsdM: null },
    h2Operating: { derivedUsdM: 2, overrideUsdM: null },
    synthCapital: { derivedUsdM: 15, overrideUsdM: null },
    synthOperating: { derivedUsdM: 0.7, overrideUsdM: null },
    logisticsOperating: { derivedUsdM: 0.3, overrideUsdM: null },
  },
  sizing: {
    nameplateTonnesPerYear: 60_000,
    nameplateMargin: 1.05,
    scaleFactor: 2.34,
    foakMultiplier: 1,
    surplusTonnesPerYear: 2850,
    distanceKm: 116,
  },
});

describe("D6 — rateBasis", () => {
  it("real basis removes the OPEX inflation growth", () => {
    const nominal = evaluateScenario(resolveScenario(baseInput(), bundle));
    const input = baseInput();
    input.flags = { ...input.flags, rateBasis: "real" };
    const real = evaluateScenario(resolveScenario(input, bundle));
    // Year 1 identical (growth exponent 0); later years cheaper under real.
    expect(real.perYear.green.totalUsdM[0]).toBeCloseTo(nominal.perYear.green.totalUsdM[0]!, 12);
    expect(real.perYear.green.totalUsdM[19]!).toBeLessThan(nominal.perYear.green.totalUsdM[19]!);
    expect(real.summary.greenTotalPvUsdM).toBeLessThan(nominal.summary.greenTotalPvUsdM);
  });
});

describe("D4 — sourcing modes", () => {
  it("v3 named-plant migrates to purchase with the contract price as override", () => {
    // v4 removed named-plant (same arithmetic as purchase); the typed
    // delivered price must survive as a price override — identical numbers.
    const raw = JSON.parse(JSON.stringify(baseInput())) as Record<string, unknown>;
    raw.schemaVersion = 3;
    const green = raw.green as Record<string, unknown>;
    green.sourcing = "named-plant";
    green.deliveredPriceUsdPerTonne = 847;
    const { input } = migrateScenarioInput(raw);
    expect(input.green.sourcing).toBe("purchase");
    expect(input.green.overrides.priceUsdPerTonne).toBe(847);
    expect("deliveredPriceUsdPerTonne" in input.green).toBe(false);
    const r = resolveScenario(input, bundle);
    expect(r.green.priceUsdPerTonne).toEqual({ value: 847, source: "override" });
    expect(r.green.prodCapexUsdM.value).toBe(0);
    expect(r.green.prodOpexUsdMPerYear.value).toBe(0);
  });

  it("build-here (v3): no merchant price, production lines summed from components", () => {
    const input = baseInput();
    input.green.sourcing = "build-here";
    input.green.buildHere = testBuildHereSite();
    delete input.flags?.legacyExcelConstruct;
    const r = resolveScenario(input, bundle);
    // Price row forced to derived 0 — the cost is CAPEX + OPEX.
    expect(r.green.priceUsdPerTonne.value).toBe(0);
    expect(r.green.priceUsdPerTonne.source).toBe("derived");
    // CAPEX = h2Capital + synthCapital; OPEX = the three operating lines.
    expect(r.green.prodCapexUsdM.value).toBe(55);
    expect(r.green.prodCapexUsdM.source).toBe("derived");
    expect(r.green.prodOpexUsdMPerYear.value).toBe(3);
  });

  it("build-here: overriding ONE component flips only that (seed, not lock)", () => {
    const input = baseInput();
    input.green.sourcing = "build-here";
    input.green.buildHere = testBuildHereSite();
    delete input.flags?.legacyExcelConstruct;
    // A consortium replaces the synthesis plant with their EPC quote:
    input.green.buildHere.components.synthCapital.overrideUsdM = 25;
    const r = resolveScenario(input, bundle);
    expect(r.green.prodCapexUsdM.value).toBe(65); // 40 derived + 25 override
    expect(r.green.prodCapexUsdM.source).toBe("override");
    // Operating untouched — still fully derived.
    expect(r.green.prodOpexUsdMPerYear.value).toBe(3);
    expect(r.green.prodOpexUsdMPerYear.source).toBe("derived");
  });

  it("waterfall integrity: build-here == equivalent build-plant, line for line", () => {
    const plant = baseInput();
    delete plant.flags?.legacyExcelConstruct;
    plant.green.sourcing = "build-plant";
    plant.green.overrides.prodCapexUsdM = 55;
    plant.green.overrides.prodOpexUsdMPerYear = 3;

    const here = baseInput();
    delete here.flags?.legacyExcelConstruct;
    here.green.sourcing = "build-here";
    here.green.buildHere = testBuildHereSite();

    const a = evaluateScenario(resolveScenario(plant, bundle));
    const b = evaluateScenario(resolveScenario(here, bundle));
    // The map changes where the numbers come from, never which line they
    // land on: identical CAPEX/OPEX shape and totals.
    expect(b.summary.greenCapexPvUsdM).toBe(a.summary.greenCapexPvUsdM);
    expect(b.summary.greenOpexPvUsdM).toBe(a.summary.greenOpexPvUsdM);
    expect(b.summary.gapPvUsdM).toBe(a.summary.gapPvUsdM);
  });

  it("dropping the legacy flag converts to CLEAN build-plant (no double charge possible)", () => {
    const input = baseInput();
    delete input.flags?.legacyExcelConstruct;
    const r = resolveScenario(input, bundle);
    // Without the flag the price row is forced to 0 — the double charge is
    // structurally impossible (the in-resolver guard remains as a backstop
    // invariant should the mode semantics ever regress).
    expect(r.green.priceUsdPerTonne.value).toBe(0);
    expect(r.green.prodCapexUsdM.value).toBe(55);
    // Invariant across ALL modes: never price>0 AND production>0 without
    // the legacy flag.
    for (const sourcing of ["purchase", "build-plant", "build-here"] as const) {
      const probe = baseInput();
      delete probe.flags?.legacyExcelConstruct;
      probe.green.sourcing = sourcing;
      if (sourcing === "build-here") probe.green.buildHere = testBuildHereSite();
      const rr = resolveScenario(probe, bundle);
      const doubleCharged =
        rr.green.priceUsdPerTonne.value > 0 &&
        (rr.green.prodCapexUsdM.value > 0 || rr.green.prodOpexUsdMPerYear.value > 0);
      expect(doubleCharged).toBe(false);
    }
  });

  it("v2 build-here payloads are rejected at migration (basis changed)", () => {
    const raw = {
      schemaVersion: 2,
      green: { sourcing: "build-here" },
      fossil: { sourcing: "purchase" },
    };
    expect(() => migrateScenarioInput(raw)).toThrowError(/calculation basis changed/);
  });

  it("v3 named-plant WITHOUT a price migrates to purchase at the benchmark", () => {
    const raw = JSON.parse(JSON.stringify(baseInput())) as Record<string, unknown>;
    raw.schemaVersion = 3;
    (raw.green as Record<string, unknown>).sourcing = "named-plant";
    const { input } = migrateScenarioInput(raw);
    expect(input.green.sourcing).toBe("purchase");
    expect(input.green.overrides.priceUsdPerTonne).toBeNull();
  });

  it("legacy construct (migrated: build-plant + flag) keeps the Excel double-count", () => {
    const r = resolveScenario(baseInput(), bundle);
    expect(r.green.priceUsdPerTonne.value).toBe(900); // merchant price
    expect(r.green.prodCapexUsdM.value).toBe(55); // AND production capex
    expect(r.green.prodOpexUsdMPerYear.value).toBe(3); // AND production O&M
  });
});
