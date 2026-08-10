/**
 * Property tests (build-plan 1.2): the decomposition is exhaustive at every
 * level — components sum to totals within 1e-9 for randomized valid
 * scenarios. Never test only totals: an earlier validation exercise on the
 * LCOH side found three offsetting component errors under an agreeing total.
 */

import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, it } from "vitest";
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
  usdM,
  usdPerGallon,
  usdPerKg,
  usdPerTonne,
} from "@h2map/units";
import type { EvalContext, SideInputs } from "@h2map/corridor-schema";
import {
  migrateScenarioInput,
  parseRefBundle,
  resolveScenario,
  type ScenarioInput,
} from "@h2map/corridor-schema";
import { buildTimeline } from "../src/timeline";
import { evaluateSide } from "../src/side";
import { evaluateScenario } from "../src/index";

const money = fc.double({ min: 0, max: 1000, noNaN: true });
const smallFrac = fc.double({ min: 0, max: 0.2, noNaN: true });

const arbCtx: fc.Arbitrary<EvalContext> = fc
  .record({
    startYear: fc.integer({ min: 2020, max: 2040 }),
    horizonYears: fc.integer({ min: 1, max: 40 }),
    wacc: smallFrac,
    inflation: fc.double({ min: 0, max: 0.05, noNaN: true }),
  })
  .map(({ startYear, horizonYears, wacc, inflation }) => ({
    timeline: buildTimeline(calendarYear(startYear), horizonYears),
    discounting: { wacc: fraction(wacc) },
    inflation: fraction(inflation),
  }));

const arbSide: fc.Arbitrary<SideInputs> = fc
  .record({
    vessels: fc.integer({ min: 1, max: 10 }),
    price: fc.double({ min: 1, max: 2000, noNaN: true }),
    ef: fc.double({ min: 0, max: 4, noNaN: true }),
    lhv: fc.double({ min: 10000, max: 130000, noNaN: true }),
    wtw: fc.double({ min: 1, max: 120, noNaN: true }),
    tonnes: fc.double({ min: 1, max: 20000, noNaN: true }),
    capexes: fc.array(money, { minLength: 4, maxLength: 4 }),
    opexes: fc.array(money, { minLength: 4, maxLength: 4 }),
    withEts: fc.boolean(),
    withImo: fc.boolean(),
    withFuelEu: fc.boolean(),
    with45z: fc.boolean(),
    withSelf: fc.boolean(),
    withFinancing: fc.boolean(),
    finGreenRate: fc.double({ min: 0, max: 0.2, noNaN: true }),
    finBaseRate: fc.double({ min: 0, max: 0.2, noNaN: true }),
    finDebtShare: fc.double({ min: 0, max: 1, noNaN: true }),
    finTenor: fc.integer({ min: 1, max: 20 }),
    finBullet: fc.boolean(),
  })
  .map((r) => ({
    label: "green" as const,
    vessels: count(r.vessels),
    fuel: {
      priceUsdPerTonne: usdPerTonne(r.price),
      combustionEf: tCo2PerTonne(r.ef),
      lhv: mjPerTonne(r.lhv),
      wtw: gCo2ePerMj(r.wtw),
      tonnesPerVesselYear: tonnesPerVesselYear(r.tonnes),
    },
    components: (["fuelProduction", "portStorage", "barge", "vessel"] as const).map(
      (id, i) => ({
        id,
        capexUsdM: usdM(r.capexes[i]!),
        opexUsdMPerYear: usdM(r.opexes[i]!),
      }),
    ),
    // Sprint 4 — the financing line joins the decomposition invariants.
    ...(r.withFinancing
      ? {
          financing: {
            greenRate: fraction(r.finGreenRate),
            baseRate: fraction(r.finBaseRate),
            debtShare: fraction(r.finDebtShare),
            tenorYears: r.finTenor,
            structure: (r.finBullet ? "bullet" : "amortizing") as const,
          },
        }
      : {}),
    regulations: {
      ...(r.withEts
        ? {
            ets: {
              euaEurPerTonne: eurPerTonne(80),
              eurUsd: eurUsd(1.08),
              scope: fraction(1),
              phaseIn: [
                { fromCalendarYear: calendarYear(2024), value: fraction(0.4) },
                { fromCalendarYear: calendarYear(2025), value: fraction(0.7) },
                { fromCalendarYear: calendarYear(2026), value: fraction(1) },
              ],
            },
          }
        : {}),
      ...(r.withFuelEu
        ? {
            fuelEu: {
              penaltyEurPerTonne: eurPerTonne(2400),
              eurUsd: eurUsd(1.08),
              scope: fraction(1),
              baselineGco2PerMj: gCo2ePerMj(91.16),
              vlsfoMjPerTonne: mjPerTonne(41000),
              targets: [
                { fromCalendarYear: calendarYear(2025), value: fraction(0.02) },
                { fromCalendarYear: calendarYear(2050), value: fraction(0.8) },
              ],
            },
          }
        : {}),
      ...(r.with45z
        ? { ira45z: { rateUsdPerGallon: usdPerGallon(1), mjPerGallon: 122.5 } }
        : {}),
      ...(r.withSelf
        ? {
            selfDesigned: {
              co2PriceUsdPerTonne: usdPerTonne(50),
              supportUsdPerKg: usdPerKg(0.5),
            },
          }
        : {}),
      ...(r.withImo
        ? {
            imoNetZero: {
              effectiveFromCalendarYear: calendarYear(2028),
              referenceIntensityGco2PerMj: gCo2ePerMj(93.3),
              baseTargets: [
                { fromCalendarYear: calendarYear(2028), value: fraction(0.04) },
                { fromCalendarYear: calendarYear(2035), value: fraction(0.3) },
              ],
              directTargets: [
                { fromCalendarYear: calendarYear(2028), value: fraction(0.17) },
                { fromCalendarYear: calendarYear(2035), value: fraction(0.43) },
              ],
              tier1UsdPerTonneCo2e: usdPerTonne(100),
              tier2UsdPerTonneCo2e: usdPerTonne(380),
              scope: fraction(1),
              rewardUsdPerTonneCo2e: usdPerTonne(0),
            },
          }
        : {}),
    },
  }));

const relClose = (a: number, b: number, tol = 1e-9): boolean =>
  a === b || Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-300) <= tol;

describe("evaluateSide — exhaustive decomposition", () => {
  it("per-year total equals the sum of its six parts (1e-9)", () => {
    fc.assert(
      fc.property(arbSide, arbCtx, (side, ctx) => {
        const r = evaluateSide(side, ctx);
        const p = r.perYear;
        for (let i = 0; i < ctx.timeline.horizonYears; i++) {
          const sum =
            p.totalCapexUsdM[i]! + p.totalOpexUsdM[i]! + p.etsUsdM[i]! +
            p.fuelEuUsdM[i]! + p.ira45zUsdM[i]! + p.selfDesignedUsdM[i]! +
            (p.imoNetZeroUsdM?.[i] ?? 0) + (p.financingUsdM?.[i] ?? 0);
          if (!relClose(p.totalUsdM[i]!, sum)) return false;
          if (!relClose(p.pvUsdM[i]!, p.totalUsdM[i]! * p.discountFactor[i]!)) return false;
        }
        return true;
      }),
    );
  });

  it("PV aggregates equal Σ(row × df) and totalPv equals their sum (1e-9)", () => {
    fc.assert(
      fc.property(arbSide, arbCtx, (side, ctx) => {
        const r = evaluateSide(side, ctx);
        const partsPv =
          r.capexPvUsdM + r.opexPvUsdM + r.etsPvUsdM + r.fuelEuPvUsdM +
          r.ira45zPvUsdM + r.selfDesignedPvUsdM + (r.imoNetZero?.pvUsdM ?? 0) +
          (r.financingPvUsdM ?? 0);
        return relClose(r.totalPvUsdM, partsPv, 1e-9);
      }),
    );
  });

  it("year-1 discount factor is exactly 1; absent regulations are exactly zero; 45Z ≤ 0; FuelEU ≥ 0", () => {
    fc.assert(
      fc.property(arbSide, arbCtx, (side, ctx) => {
        const r = evaluateSide(side, ctx);
        if (r.perYear.discountFactor[0] !== 1) return false;
        if (!side.regulations.ets && r.perYear.etsUsdM.some((v) => v !== 0)) return false;
        if (!side.regulations.fuelEu && r.perYear.fuelEuUsdM.some((v) => v !== 0)) return false;
        if (!side.regulations.ira45z && r.perYear.ira45zUsdM.some((v) => v !== 0)) return false;
        if (!side.regulations.imoNetZero && r.perYear.imoNetZeroUsdM !== undefined) return false;
        // Sprint 4 — financing: absent without params; with them, the sign
        // of every year's value opposes the sign of Δr = base − green.
        if (!side.financing && r.perYear.financingUsdM !== undefined) return false;
        if (side.financing && r.perYear.financingUsdM) {
          const deltaR = side.financing.baseRate - side.financing.greenRate;
          for (const v of r.perYear.financingUsdM) {
            if (deltaR > 0 && v > 1e-12) return false; // saving: ≤ 0
            if (deltaR < 0 && v < -1e-12) return false; // premium: ≥ 0
          }
        }
        if (r.perYear.ira45zUsdM.some((v) => v > 0)) return false;
        if (r.perYear.fuelEuUsdM.some((v) => v < 0)) return false;
        return true;
      }),
    );
  });
});

describe("evaluateScenario — gap identity over randomized overrides", () => {
  const bundle = parseRefBundle(
    JSON.parse(
      readFileSync(
        new URL("../../../data/corridor-ref/2026-07-30-excel-v1.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  const baseInput = JSON.parse(
    readFileSync(
      new URL("../../../fixtures/golden/corridor/excel-baseline.input.json", import.meta.url),
      "utf8",
    ),
  ) as unknown;

  it("gap = green − fossil and summary totals match per-year sums", () => {
    fc.assert(
      fc.property(
        fc.record({
          price: fc.double({ min: 100, max: 2000, noNaN: true }),
          wacc: fc.double({ min: 0.01, max: 0.15, noNaN: true }),
          horizon: fc.integer({ min: 1, max: 40 }),
        }),
        ({ price, wacc, horizon }) => {
          const input = migrateScenarioInput(
            JSON.parse(JSON.stringify(baseInput)),
          ).input as ScenarioInput;
          input.green.overrides.priceUsdPerTonne = price;
          input.cargo.waccOverride = wacc;
          input.cargo.horizonYears = horizon;
          const result = evaluateScenario(resolveScenario(input, bundle));
          const s = result.summary;
          if (!relClose(s.gapPvUsdM, s.greenTotalPvUsdM - s.fossilTotalPvUsdM, 1e-12)) return false;
          const greenPvSum = result.perYear.green.pvUsdM.reduce((a, b) => a + b, 0);
          return relClose(s.greenTotalPvUsdM, greenPvSum, 1e-12);
        },
      ),
    );
  });

  it("reporting: pre/post split identities hold (fix #1)", () => {
    fc.assert(
      fc.property(
        fc.record({
          price: fc.double({ min: 100, max: 2000, noNaN: true }),
          co2Price: fc.double({ min: 0, max: 500, noNaN: true }),
          horizon: fc.integer({ min: 1, max: 40 }),
        }),
        ({ price, co2Price, horizon }) => {
          const input = migrateScenarioInput(
            JSON.parse(JSON.stringify(baseInput)),
          ).input as ScenarioInput;
          input.green.overrides.priceUsdPerTonne = price;
          input.regulation.selfDesigned.enabled = true;
          input.regulation.selfDesigned.co2PriceUsdPerTonne = co2Price;
          input.cargo.horizonYears = horizon;
          const result = evaluateScenario(resolveScenario(input, bundle));
          const s = result.summary;
          const r = result.reporting;
          // Exact identities (same FP expressions by construction):
          if (r.gapPvPostRegulationUsdM !== s.gapPvUsdM) return false;
          if (
            r.gapPvPostRegulationUsdM - r.gapPvPreRegulationUsdM !==
            r.netRegulatoryEffectUsdM
          )
            return false;
          // Pre-reg side PV = capex PV + opex PV, exactly.
          if (r.greenPreRegulationPvUsdM !== s.greenCapexPvUsdM + s.greenOpexPvUsdM)
            return false;
          if (r.fossilPreRegulationPvUsdM !== s.fossilCapexPvUsdM + s.fossilOpexPvUsdM)
            return false;
          // Net effect equals the sum of the per-scheme PV lines plus the
          // financing line (sprint 4 — it sits outside the pre-reg subtotal).
          const netFromLines =
            s.etsGreenPvUsdM +
            s.fuelEuGreenPvUsdM +
            s.ira45zGreenPvUsdM +
            s.selfDesignedGreenPvUsdM +
            (s.financingGreenPvUsdM ?? 0) -
            (s.etsFossilPvUsdM + s.fuelEuFossilPvUsdM + s.selfDesignedFossilPvUsdM);
          if (
            Math.abs(r.netRegulatoryEffectUsdM - netFromLines) >
            1e-9 * Math.max(1, Math.abs(netFromLines))
          )
            return false;
          // Unit metrics: post equals the summary's figures exactly.
          return (
            r.costPerUnitPostRegulationUsd === s.costPerUnitUsd &&
            r.costPerTonneCo2PostRegulationUsd === s.costPerTonneCo2Usd
          );
        },
      ),
    );
  });
});
