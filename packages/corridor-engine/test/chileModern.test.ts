/**
 * The Chilean corridor on the CURRENT model — acceptance against the study.
 *
 * `chileStudyCalibrationInput` (reporting.test.ts) pins the study's published
 * totals forever by asserting the study's own answers: the burns, the fossil
 * fleet cost and a regulatory proxy fitted to reproduce its benefit. That pin
 * must never move, and it does not — it resolves against the v1 bundle.
 *
 * This is the other half of the pair. It runs the SAME corridor with those
 * overrides released, so consumption derives from the researched hull, the
 * fossil counterfactual is priced from the catalogue, and regulation comes
 * from the structured IMO ladder rather than a fitted flat price.
 *
 * NOTHING HERE IS TUNED TO THE STUDY. Where it lands is the finding, and the
 * finding is that deriving the burn lands CLOSER than asserting it did:
 * CO2 abated moves from −23% to −4.2% and $/t cargo from +1.6% to −0.06%.
 * The tolerances below are the measured result plus headroom, not targets
 * someone fitted inputs to hit.
 *
 * It imports the SHIPPED builder rather than restating the scenario, so this
 * cannot pass while the seeded project drifts away from it.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRefBundle, resolveScenario, parseScenarioInput } from "@h2map/corridor-schema";
import { evaluateScenario } from "../src/index";
import {
  defaultScenario,
  modernChileScenario,
} from "../../../apps/web/lib/corridor/scenarioDefaults";

const bundle = parseRefBundle(
  JSON.parse(
    readFileSync(
      new URL("../../../data/corridor-ref/2026-08-21-cruise-v6.json", import.meta.url),
      "utf8",
    ),
  ),
);

const run = (s = modernChileScenario()) => evaluateScenario(resolveScenario(s, bundle));
const resolved = (s = modernChileScenario()) => resolveScenario(s, bundle);

/** The study's published totals — the fixed points everything is scored on. */
const STUDY = {
  greenPvUsdM: 2850,
  fossilPvUsdM: 850,
  gapPvUsdM: 2000,
  costPerCargoTonneUsd: 80,
  co2AbatedTonnes: 1_450_000,
} as const;

describe("Chilean corridor, current model — study acceptance", () => {
  const r = run();

  it("green corridor PV within 1% of the study", () => {
    // Unmoved from the calibrated run: the plant CAPEX/OPEX blocks are still
    // the study's fitted figures, because nothing has replaced them as a
    // source. Releasing the burn overrides does not touch them.
    const d = r.reporting.greenPreRegulationPvUsdM / STUDY.greenPvUsdM - 1;
    expect(Math.abs(d)).toBeLessThan(0.01);
  });

  it("fossil corridor PV within 5% of the study", () => {
    // Moves +2.6%: the fossil fleet is now priced from the catalogue as a
    // newbuild rather than asserted at $35m/ship, and its burn derives.
    const d = r.reporting.fossilPreRegulationPvUsdM / STUDY.fossilPvUsdM - 1;
    expect(Math.abs(d)).toBeLessThan(0.05);
  });

  it("pre-regulation gap within 3% of the study", () => {
    const d = r.reporting.gapPvPreRegulationUsdM / STUDY.gapPvUsdM - 1;
    expect(Math.abs(d)).toBeLessThan(0.03);
  });

  it("incremental cost per cargo tonne within 3% of the study", () => {
    const d =
      r.reporting.costPerUnitPreRegulationUsd / STUDY.costPerCargoTonneUsd - 1;
    expect(Math.abs(d)).toBeLessThan(0.03);
  });

  it("CO2 abated within 8% of the study", () => {
    // The loosest band, and deliberately so. The study's 1.45 Mt assumes a
    // WtW=0 green ammonia, which is not a certifiable value under the refined
    // method (certified 15 + N2O slip + 5% pilot gives a 22.14 blend). A gap
    // here is a disagreement about accounting, not an arithmetic error.
    const d = r.summary.co2AbatedTonnes / STUDY.co2AbatedTonnes - 1;
    expect(Math.abs(d)).toBeLessThan(0.08);
  });
});

describe("the demo derives — it does not restate the study", () => {
  it("both burns are DERIVED, not overridden", () => {
    // The whole point. If either side carried a burn override, every number
    // above would be a restatement of the study rather than a test of it.
    const s = modernChileScenario();
    expect(s.green.overrides.fuelTonnesPerVesselYear).toBeNull();
    expect(s.fossil.overrides.fuelTonnesPerVesselYear).toBeNull();
  });

  it("burn responds to corridor geometry", () => {
    // The guard that makes the acceptance tests mean something: an asserted
    // burn would not move when the voyage doubles.
    const near = modernChileScenario();
    near.cargo = { ...near.cargo, oneWayDistanceNm: 4750 };
    const far = modernChileScenario();
    far.cargo = { ...far.cargo, oneWayDistanceNm: 9500 };
    const burn = (s: ReturnType<typeof modernChileScenario>) =>
      resolved(s).green.tonnesPerVesselYear.value as number;
    expect(burn(far) / burn(near)).toBeCloseTo(2, 6);
  });

  it("delivered-energy parity is EXACT, not coincidental", () => {
    // CO2 abated is a mass difference, valid only when both tonnages carry
    // the same delivered energy. The derived chain makes that exact by
    // construction. The calibrated scenario only passes because the study's
    // 5,700/2,638 pair happens to sit 0.03% from the LHV ratio — true, but
    // nothing enforced it.
    const r = run();
    expect(r.energyParity?.ratio).toBeCloseTo(1, 9);
    expect(r.energyParity?.diverged).toBe(false);
  });

  it("prices the fossil fleet from the catalogue, not an override", () => {
    const s = modernChileScenario();
    expect(s.vessel.fossil.capexUsdMPerShip).toBeNull();
    expect(s.flags?.fossilFleetBasis).toBe("newbuild");
    const capex = resolved(s).fossil.vesselCapexUsdMPerShip.value as number;
    const row = bundle.vesselTypes.find((v) => v.id === s.vessel.typeId)!;
    expect(capex).toBe(row.capexUsdM);
  });
});

describe("regulation and financing are separate floats, as the study has them", () => {
  it("uses the structured IMO ladder, not the fitted $280/t proxy", () => {
    // The proxy was calibrated to reproduce the study's ≈$250m back when the
    // financing module did not exist. Leaving it on alongside financing
    // counts part of the same benefit twice.
    const s = modernChileScenario();
    expect(s.regulation.selfDesigned.enabled).toBe(false);
    expect(s.regulation.imoNetZero?.enabled).toBe(true);
    const imo = run(s).reporting.imoNetZero;
    expect(imo && !("notParameterised" in imo && imo.notParameterised)).toBe(true);
  });

  it("financing sits between the amortizing and bullet bounds around the study's ≈$250m", () => {
    // Bounds, not a target: amortizing $195.9m and bullet $312.5m bracket the
    // study's figure. Asserting the bracket rather than the value is the
    // point — a forced match would fabricate precision the source lacks.
    const pv = run().summary.financingGreenPvUsdM!;
    expect(pv).toBeLessThan(0);
    expect(Math.abs(pv)).toBeGreaterThan(150);
    expect(Math.abs(pv)).toBeLessThan(320);
  });
});

describe("it does not disturb the calibrated example", () => {
  it("leaves defaultScenario() untouched", () => {
    // modernChileScenario() builds ON defaultScenario(); a mutation instead
    // of a copy would silently re-point the shipped default and the sweep
    // baseline with it.
    const before = JSON.stringify(defaultScenario());
    modernChileScenario();
    expect(JSON.stringify(defaultScenario())).toBe(before);
  });

  it("is a valid stored scenario", () => {
    // It is written to the database by the seed route, so it must satisfy
    // the same validator as a hand-saved project.
    expect(() =>
      parseScenarioInput(JSON.parse(JSON.stringify(modernChileScenario()))),
    ).not.toThrow();
  });
});
