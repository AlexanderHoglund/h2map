import { describe, expect, it } from "vitest";
import type { CorridorModel } from "../../apps/web/components/corridor/state";
import { firstBlockedTab, tabStatuses } from "../../apps/web/components/corridor/tabStatus";

/**
 * The tab marks: blue → (▲/✕) → green, with a strict priority per tab
 * (red > amber > visited?green:blue).
 *
 * The defect this replaces: every tab showed a green tick from the moment
 * the wizard opened, so "complete" was the default rather than something
 * the user and the model both vouched for. These tests pin the corrected
 * semantics with a minimal fake model — the function only reads scenario,
 * bundle rows, resolved sources, result advisories and the error string.
 */

/** The smallest model the status function accepts, verified-clean. */
function fakeModel(over: Partial<Record<string, unknown>> = {}): CorridorModel {
  const base = {
    bundle: {
      countries: [
        { id: "cl", verified: true },
        { id: "other", verified: false },
      ],
      vesselTypes: [{ id: "tanker-35k", verified: true }],
      fuels: [
        { id: "e-ammonia", verified: true },
        { id: "lsfo", verified: true },
      ],
    },
    scenario: {
      cargo: { countryId: "cl", oneWayDistanceNm: 9500 },
      vessel: { typeId: "tanker-35k" },
      green: { fuelId: "e-ammonia" },
      fossil: { fuelId: "lsfo" },
    },
    resolved: {
      wacc: { source: "benchmark" },
      green: {
        vesselCapexUsdMPerShip: { source: "derived" },
        priceUsdPerTonne: { source: "benchmark" },
      },
      fossil: { priceUsdPerTonne: { source: "benchmark" } },
    },
    result: { energyParity: { diverged: false } },
    error: null,
    ...over,
  };
  return base as unknown as CorridorModel;
}

const NONE: ReadonlySet<string> = new Set();

describe("blue is the honest starting state", () => {
  it("shows every input tab blue on a fresh, valid model", () => {
    const s = tabStatuses(fakeModel(), NONE);
    for (const k of ["intro", "energy", "vessels", "cargo", "ports", "financing", "regulation"] as const) {
      expect(s[k].state, k).toBe("blue");
    }
    // The picker is not a form to review.
    expect(s.projects.state).toBe("green");
  });

  it("turns green only for visited tabs", () => {
    const s = tabStatuses(fakeModel(), new Set(["vessels"]));
    expect(s.vessels.state).toBe("green");
    expect(s.energy.state).toBe("blue");
  });
});

/** A full side for the plausibility roll-up: overrides + benchmarks. */
const sideOverrides = (price: number | null = null) => ({
  priceUsdPerTonne: price,
  combustionEfTco2PerTonne: null,
  lhvMjPerTonne: null,
  wtwGco2PerMj: null,
  fuelTonnesPerVesselYear: null,
  prodCapexUsdM: null,
  prodOpexUsdMPerYear: null,
  portStorageCapexUsdM: null,
  portStorageOpexUsdMPerYear: null,
  bargeCapexUsdM: null,
  bargeOpexUsdMPerYear: null,
});
const sideBench = () => ({
  priceUsdPerTonne: { value: 900 },
  combustionEf: { value: 1 },
  lhv: { value: 18600 },
  wtw: { value: 15 },
  tonnesPerVesselYear: { value: 5000 },
  prodCapexUsdM: { value: 55 },
  prodOpexUsdMPerYear: { value: 3 },
  portStorageCapexUsdM: { value: 12 },
  portStorageOpexUsdMPerYear: { value: 1 },
  bargeCapexUsdM: { value: 5 },
  bargeOpexUsdMPerYear: { value: 0.3 },
  vesselCapexUsdMPerShip: { value: 42.5 },
  vesselOpexUsdMPerShipPerYear: { value: 2.47 },
});
/** A model whose green price override the USER typed to 0 this session. */
function implausibleModel(price: number | null): CorridorModel {
  const scenario = {
    cargo: { countryId: "cl", oneWayDistanceNm: 9500, waccOverride: null },
    vessel: {
      typeId: "tanker-35k",
      green: { capexUsdMPerShip: null, opexUsdMPerShipPerYear: null },
      fossil: { capexUsdMPerShip: null, opexUsdMPerShipPerYear: null },
    },
    green: { fuelId: "e-ammonia", sourcing: "purchase", overrides: sideOverrides(price) },
    fossil: { fuelId: "lsfo", sourcing: "purchase", overrides: sideOverrides() },
  };
  const loaded = JSON.parse(JSON.stringify(scenario)) as typeof scenario;
  loaded.green.overrides.priceUsdPerTonne = null; // session started clean
  return fakeModel({
    scenario,
    loaded,
    benchmarks: { wacc: { value: 0.08 }, green: sideBench(), fossil: sideBench() },
  });
}

describe("a warning is never masked by a visit", () => {
  it("keeps energy amber across visits while a typed override is implausible, then clears", () => {
    // The amber doctrine after the 2026-08-20 redesign: a tab is amber
    // exactly when a FIELD on it shows its own warning. A $0 price typed
    // against a $900 benchmark is such a field warning — and a visit never
    // masks it.
    const bad = implausibleModel(0);
    expect(tabStatuses(bad, new Set(["energy"])).energy.state).toBe("amber");
    expect(tabStatuses(bad, new Set(["energy"])).energy.reasonKeys).toContain("implausible");
    // Restoring the benchmark clears the field warning and the tab with it.
    expect(tabStatuses(implausibleModel(null), new Set(["energy"])).energy.state).toBe("green");
  });

  it("keeps unverified benchmarks OFF the tab: field badges carry provenance", () => {
    // An unverified country row in use is a data-quality fact about the
    // reference table, not a fault in the user's input — no triangle.
    const m = fakeModel({
      scenario: {
        cargo: { countryId: "other", oneWayDistanceNm: 9500 },
        vessel: { typeId: "tanker-35k" },
        green: { fuelId: "e-ammonia" },
        fossil: { fuelId: "lsfo" },
      },
    });
    expect(tabStatuses(m, NONE).financing.state).toBe("blue");
    expect(tabStatuses(m, new Set(["financing"])).financing.state).toBe("green");
  });

  it("keeps result-derived advisories OFF the tabs: no field warning, no triangle", () => {
    // Parity divergence and material port share were removed from tab level
    // in the 2026-08-20 redesign: neither maps to a field a user can fix,
    // so a triangle for them was an un-clearable forever-indication. Their
    // notes stay in the tab BODIES; the tabs stay clean.
    const m = fakeModel({
      result: {
        energyParity: { diverged: true },
        portEnergy: { material: true },
      },
    });
    const s = tabStatuses(m, NONE);
    expect(s.energy.state).toBe("blue");
    expect(s.vessels.state).toBe("blue");
  });

  it("flags intro when the typed distance diverges >15% from the routed one", () => {
    const m = fakeModel({
      scenario: {
        cargo: {
          countryId: "cl",
          oneWayDistanceNm: 12000,
          routedDistance: { nm: 9500 },
        },
        vessel: { typeId: "tanker-35k" },
        green: { fuelId: "e-ammonia" },
        fossil: { fuelId: "lsfo" },
      },
    });
    expect(tabStatuses(m, NONE).intro.reasonKeys).toContain("routedDivergence");
  });
});

describe("red attribution", () => {
  it("attributes a cargo-worded error to the cargo tab (impossible before)", () => {
    const s = tabStatuses(fakeModel({ error: "cargo.roundtripsPerYear must be positive" }), NONE);
    expect(s.cargo.state).toBe("red");
    expect(s.results.state).toBe("red");
    expect(firstBlockedTab(s)).toBe("cargo");
  });

  it("attributes a bundle-pin mismatch to the projects tab", () => {
    const s = tabStatuses(fakeModel({ error: 'scenario pins bundle "x" but got "y"' }), NONE);
    expect(s.projects.state).toBe("red");
  });

  it("falls back to intro on an unrecognised error", () => {
    expect(tabStatuses(fakeModel({ error: "???" }), NONE).intro.state).toBe("red");
  });

  it("red beats amber, which beats visited-green", () => {
    const m = fakeModel({
      error: 'vessel type "x" not found',
      result: { energyParity: { diverged: false }, portEnergy: { material: true } },
    });
    // vessels carries BOTH the port-share amber and the vessel red: red
    // must win, visited or not.
    const s = tabStatuses(m, new Set(["vessels"]));
    expect(s.vessels.state).toBe("red");
  });
});
