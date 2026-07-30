import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRefBundle } from "../src/ref/bundle";
import { parseScenarioInput } from "../src/validate";
import { resolveScenario, toSideInputs } from "../src/resolve";
import type { ScenarioInput } from "../src/scenario";

const bundle = parseRefBundle(
  JSON.parse(
    readFileSync(
      new URL("../../../data/corridor-ref/2026-07-30-excel-v1.json", import.meta.url),
      "utf8",
    ),
  ),
);

function fixtureInput(): ScenarioInput {
  return parseScenarioInput(
    JSON.parse(
      readFileSync(
        new URL(
          "../../../fixtures/golden/corridor/excel-baseline.input.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
}

describe("resolveScenario — fixture defaults (all overrides null)", () => {
  const r = resolveScenario(fixtureInput(), bundle);

  it("derives fuel consumption from distance using the resolved LHV", () => {
    // 500×2 nm × 12 roundtrips × 4 GJ/nm × 1000 / 18600 MJ/t (Fuel!F15)
    expect(r.green.tonnesPerVesselYear.value).toBe(2580.6451612903224);
    expect(r.green.tonnesPerVesselYear.source).toBe("derived");
    expect(r.fossil.tonnesPerVesselYear.value).toBe(1194.0298507462687);
  });

  it("derives green vessel CAPEX from type × (1 + fuel premium)", () => {
    expect(r.green.vesselCapexUsdM.value).toBe(25); // 20 × 1.25 (Vessel!F12)
    expect(r.green.vesselCapexUsdM.source).toBe("derived");
  });

  it("applies the fossil existing-infrastructure rules", () => {
    expect(r.fossil.vesselCapexUsdM.value).toBe(0); // Vessel!F18
    expect(r.fossil.portStorageCapexUsdM.value).toBe(0); // Port!F17
    expect(r.fossil.bargeCapexUsdM.value).toBe(0); // Port!F20
    // LSFO table opex are 0, so ×0.3 keeps 0 (Port!F18/F21)
    expect(r.fossil.portStorageOpexUsdMPerYear.value).toBe(0);
  });

  it("zeroes production cost under Purchase sourcing", () => {
    expect(r.fossil.prodCapexUsdM.value).toBe(0);
    expect(r.fossil.prodCapexUsdM.source).toBe("derived");
    // Green Construct keeps the fuel-table production cost
    expect(r.green.prodCapexUsdM.value).toBe(55);
    expect(r.green.prodCapexUsdM.source).toBe("benchmark");
  });

  it("resolves WACC from the country benchmark (unverified table)", () => {
    expect(r.wacc.value).toBe(0.055);
    expect(r.wacc.source).toBe("benchmark");
  });

  it("shapes side regulations asymmetrically as data", () => {
    expect(r.regulations.green.ets).toBeDefined();
    expect(r.regulations.fossil.fuelEu).toBeDefined();
    expect(r.regulations.green.ira45z).toBeUndefined(); // disabled in fixture
    expect(r.regulations.green.selfDesigned).toBeUndefined();
  });
});

describe("resolveScenario — precedence", () => {
  it("override wins over benchmark and derived", () => {
    const input = fixtureInput();
    input.green.overrides.priceUsdPerTonne = 777;
    input.green.overrides.fuelTonnesPerVesselYear = 2000;
    const r = resolveScenario(input, bundle);
    expect(r.green.priceUsdPerTonne).toEqual({ value: 777, source: "override" });
    expect(r.green.tonnesPerVesselYear).toEqual({ value: 2000, source: "override" });
  });

  it("Purchase-zeroing beats an override (Fuel!E16 ordering)", () => {
    const input = fixtureInput();
    input.fossil.overrides.prodCapexUsdM = 99;
    const r = resolveScenario(input, bundle);
    expect(r.fossil.prodCapexUsdM.value).toBe(0);
  });

  it("45Z requires enabled AND US-produced", () => {
    const input = fixtureInput();
    input.regulation.ira45z = { enabled: true, usProduced: false, rateUsdPerGallon: 1 };
    expect(resolveScenario(input, bundle).regulations.green.ira45z).toBeUndefined();
    input.regulation.ira45z.usProduced = true;
    const r = resolveScenario(input, bundle);
    expect(r.regulations.green.ira45z).toMatchObject({ rateUsdPerGallon: 1, mjPerGallon: 122.5 });
    expect(r.regulations.fossil.ira45z).toBeUndefined(); // never on fossil
  });

  it("fossil self-designed carries only the CO2 term", () => {
    const input = fixtureInput();
    input.regulation.selfDesigned = {
      enabled: true, co2PriceUsdPerTonne: 50, supportUsdPerKg: 1,
      capexSupport: 0.1, opexSupport: 0.1, otherUsdM: 2,
    };
    const r = resolveScenario(input, bundle);
    expect(r.regulations.green.selfDesigned).toMatchObject({ co2PriceUsdPerTonne: 50, supportUsdPerKg: 1 });
    expect(r.regulations.fossil.selfDesigned).toEqual({ co2PriceUsdPerTonne: 50 });
  });

  it("rejects a bundle-id mismatch", () => {
    const input = fixtureInput();
    input.refBundleId = "some-other-bundle";
    expect(() => resolveScenario(input, bundle)).toThrowError(/pins bundle/);
  });
});

describe("toSideInputs", () => {
  it("strips to bare scalars with the four uniform components", () => {
    const r = resolveScenario(fixtureInput(), bundle);
    const green = toSideInputs(r, "green");
    expect(green.components.map((c) => c.id)).toEqual([
      "fuelProduction", "portStorage", "barge", "vessel",
    ]);
    expect(green.components.map((c) => c.capexUsdM)).toEqual([55, 12, 5, 25]); // Σ = 97
    expect(green.fuel.priceUsdPerTonne).toBe(900);
    const fossil = toSideInputs(r, "fossil");
    expect(fossil.components.map((c) => c.capexUsdM)).toEqual([0, 0, 0, 0]);
  });
});
