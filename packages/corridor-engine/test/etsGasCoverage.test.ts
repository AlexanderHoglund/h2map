/**
 * ETS gas coverage — CH4 and N2O, on by default from 2026.
 *
 * Not a preference and not prospective: maritime ETS accounts for CO2 only in
 * 2024 and 2025, with CH4 and N2O falling under scope from 1 January 2026.
 * The Commission has already increased the allowance volume by 2,375,680
 * units to account for it. A corridor starting 2026 or later that leaves the
 * block off understates the fossil side — decisively so for LNG, where
 * methane slip dominates the charge.
 *
 * It used to be an OPTIONAL block, off unless a scenario typed four factors
 * and two GWPs by hand. Now the year and the factors both come from reference
 * data, and an explicit scenario block still wins so a pre-2026 case stays
 * reproducible.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  migrateScenarioInput,
  parseRefBundle,
  resolveScenario,
  type ScenarioInput,
} from "@h2map/corridor-schema";
import { evaluateScenario } from "../src/index";
import { defaultScenario } from "../../../apps/web/lib/corridor/scenarioDefaults";

const load = (v: string) =>
  parseRefBundle(
    JSON.parse(
      readFileSync(
        new URL(`../../../data/corridor-ref/${v}.json`, import.meta.url),
        "utf8",
      ),
    ),
  );
const bundle = load("2026-08-18-fuel-v4");

/** ETS on, factors derived, nothing about gases stated by the scenario. */
function scenario(
  startYear: number,
  gasCoverage?: Record<string, unknown>,
): ScenarioInput {
  const s = JSON.parse(JSON.stringify(defaultScenario())) as Record<string, never>;
  const o = s as unknown as Record<string, Record<string, unknown>>;
  o.cargo = { ...o.cargo, startYear, horizonYears: 6 };
  for (const side of ["green", "fossil"] as const) {
    const cur = o[side]!;
    o[side] = {
      ...cur,
      overrides: {
        ...(cur.overrides as Record<string, unknown>),
        combustionEfTco2PerTonne: null,
        wtwGco2PerMj: null,
        lhvMjPerTonne: null,
      },
    };
  }
  o.regulation = {
    ...o.regulation,
    eurUsd: 1.08,
    ets: { enabled: true, euaEurPerTonne: 100, scope: 1, ...(gasCoverage ? { gasCoverage } : {}) },
    emissions: { framework: "fueleu" },
  };
  return migrateScenarioInput(s as never).input;
}

/** The resolved gas block for a side, or undefined when coverage is off. */
const gasesOf = (input: ScenarioInput, side: "green" | "fossil", b = bundle) =>
  (
    resolveScenario(input, b).regulations[side].ets as unknown as
      | Record<string, Record<string, number> | undefined>
      | undefined
  )?.gases;

describe("coverage is on by default", () => {
  it("resolves gases for a 2029-start scenario that says nothing about them", () => {
    const g = gasesOf(scenario(2029), "fossil");
    expect(g).toBeDefined();
    expect(g!.fromCalendarYear).toBe(2026);
  });

  it("takes the year from the BUNDLE, not a literal", () => {
    // A hardcoded 2026 would not track a future amendment, and the bundle
    // carries the citation next to the number.
    expect(bundle.regulationDefaults.ets.gasCoverageFromCalendarYear).toBe(2026);
    expect(bundle.regulationDefaults.ets.gasCoverageSourceNote).toMatch(/2023\/959/);
  });

  it("derives the factors instead of taking typed ones", () => {
    // LSFO's Annex II combustion factors, read off the dataset row rather
    // than transcribed: CH4 0.00005 g/g and N2O 0.00018 g/g.
    const g = gasesOf(scenario(2029), "fossil")!;
    expect(g.ch4TPerTonne).toBeCloseTo(0.00005, 8);
    expect(g.n2oTPerTonne).toBeCloseTo(0.00018, 8);
  });

  it("uses the selected framework's GWP set", () => {
    // FuelEU fixes AR4 (25 / 298). A typed GWP disagreeing with the framework
    // selector above it is the same class of error as a typed slip factor.
    const g = gasesOf(scenario(2029), "fossil")!;
    expect(g.gwpCh4).toBe(25);
    expect(g.gwpN2o).toBe(298);
  });
});

describe("the year gate is real", () => {
  it("charges CO2 only before 2026, CO2e from 2026, within ONE run", () => {
    // The per-year step the Directive actually specifies. Asserted inside a
    // single scenario so it cannot be satisfied by two differently-configured
    // runs agreeing by accident.
    // Per-year arrays are indexed off `cargo.startYear` (NOT
    // startCalendarYear, which is a different field): with a 2024 start,
    // index 1 is 2025 and index 2 is 2026.
    const ets = evaluateScenario(resolveScenario(scenario(2024), bundle)).perYear.fossil
      .etsUsdM;
    // Phase-in also steps (0.7 -> 1.0), so compare the ETS charge per unit of
    // phase-in rather than the raw figures.
    const per2025 = ets[1]! / 0.7;
    const per2026 = ets[2]! / 1.0;
    expect(per2026).toBeGreaterThan(per2025);
    // The step is the gases: ~1.76% of the CO2-only charge for LSFO.
    expect(per2026 / per2025).toBeCloseTo(1.0176, 3);
  });

  it("leaves a pre-2026 corridor untouched", () => {
    const on = evaluateScenario(resolveScenario(scenario(2024), bundle)).perYear.fossil
      .etsUsdM;
    const noGas = evaluateScenario(
      resolveScenario(
        scenario(2024, {
          enabled: false,
          fromCalendarYear: 2026,
          gwpCh4: 25,
          gwpN2o: 298,
          green: { ch4TPerTonne: 0, n2oTPerTonne: 0 },
          fossil: { ch4TPerTonne: 0, n2oTPerTonne: 0 },
        }),
        bundle,
      ),
    );
    // 2024 and 2025 are identical with coverage on or off; only 2026 differs.
    expect(on[0]!).toBeCloseTo(noGas.perYear.fossil.etsUsdM[0]!, 12);
    expect(on[1]!).toBeCloseTo(noGas.perYear.fossil.etsUsdM[1]!, 12);
    expect(on[2]!).toBeGreaterThan(noGas.perYear.fossil.etsUsdM[2]!);
  });
});

describe("an explicit scenario block still wins", () => {
  it("honours enabled:false so a pre-2026 case stays reproducible", () => {
    const off = gasesOf(
      scenario(2029, {
        enabled: false,
        fromCalendarYear: 2026,
        gwpCh4: 25,
        gwpN2o: 298,
        green: { ch4TPerTonne: 0, n2oTPerTonne: 0 },
        fossil: { ch4TPerTonne: 0, n2oTPerTonne: 0 },
      }),
      "fossil",
    );
    expect(off).toBeUndefined();
  });

  it("honours typed factors over the derived ones", () => {
    const g = gasesOf(
      scenario(2029, {
        enabled: true,
        fromCalendarYear: 2027,
        gwpCh4: 28,
        gwpN2o: 265,
        green: { ch4TPerTonne: 0, n2oTPerTonne: 0 },
        fossil: { ch4TPerTonne: 0.5, n2oTPerTonne: 0.25 },
      }),
      "fossil",
    )!;
    expect(g.fromCalendarYear).toBe(2027);
    expect(g.ch4TPerTonne).toBe(0.5);
    expect(g.gwpCh4).toBe(28);
  });
});

describe("disabling it on a 2026+ corridor is disclosed", () => {
  const disabled = {
    enabled: false,
    fromCalendarYear: 2026,
    gwpCh4: 25,
    gwpN2o: 298,
    green: { ch4TPerTonne: 0, n2oTPerTonne: 0 },
    fossil: { ch4TPerTonne: 0, n2oTPerTonne: 0 },
  };

  it("reports the affected span when coverage is switched off", () => {
    // The run is still legitimate — reproducing a pre-2026 case needs it —
    // so this says what the numbers exclude rather than refusing.
    const r = evaluateScenario(resolveScenario(scenario(2029, disabled), bundle));
    expect(r.divergences?.etsGasCoverageDisabled).toEqual({
      fromCalendarYear: 2026,
      affectedYears: 6, // 2029-2034, all at or after 2026
    });
  });

  it("says nothing when the corridor ends before coverage starts", () => {
    const r = evaluateScenario(resolveScenario(scenario(2020, disabled), bundle));
    expect(r.divergences?.etsGasCoverageDisabled).toBeUndefined();
  });

  it("says nothing when coverage is left ON", () => {
    // It must be impossible to trigger this by omission — the default is on.
    const r = evaluateScenario(resolveScenario(scenario(2029), bundle));
    expect(r.divergences?.etsGasCoverageDisabled).toBeUndefined();
  });
});

describe("older bundles keep the behaviour they were computed with", () => {
  it("resolves NO gases against a bundle carrying no coverage year", () => {
    // excel-baseline resolves against 2026-07-30-excel-v1 and must stay
    // byte-identical; the absent year is what guarantees that, independently
    // of its pre-2024 calendar.
    // Asserted on the bundle rather than by resolving a modern scenario
    // against it: this bundle predates the current vessel catalogue, so a
    // resolve would fail on the vessel id long before reaching gas coverage.
    for (const v of ["2026-07-30-excel-v1", "2026-08-16-vessel-v2", "2026-08-17-vessel-v3"]) {
      expect(
        load(v).regulationDefaults.ets.gasCoverageFromCalendarYear,
        v,
      ).toBeUndefined();
    }
  });
});
