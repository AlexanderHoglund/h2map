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

describe("a warning is never masked by a visit", () => {
  it("keeps financing amber after visiting when WACC runs on an unverified benchmark", () => {
    const m = fakeModel({
      scenario: {
        cargo: { countryId: "other", oneWayDistanceNm: 9500 },
        vessel: { typeId: "tanker-35k" },
        green: { fuelId: "e-ammonia" },
        fossil: { fuelId: "lsfo" },
      },
    });
    const unvisited = tabStatuses(m, NONE);
    expect(unvisited.financing.state).toBe("amber");
    expect(unvisited.financing.targetFieldId).toBe("cargo.wacc");
    const visited = tabStatuses(m, new Set(["financing"]));
    expect(visited.financing.state).toBe("amber");
    expect(visited.financing.reasonKeys).toContain("waccUnverified");
  });

  it("clears to green (not blue) once the warning is resolved on a visited tab", () => {
    const m = fakeModel({
      resolved: {
        wacc: { source: "override" },
        green: {
          vesselCapexUsdMPerShip: { source: "derived" },
          priceUsdPerTonne: { source: "benchmark" },
        },
        fossil: { priceUsdPerTonne: { source: "benchmark" } },
      },
    });
    expect(tabStatuses(m, new Set(["financing"])).financing.state).toBe("green");
  });

  it("marks energy on parity divergence and vessels on material port share", () => {
    const m = fakeModel({
      result: {
        energyParity: { diverged: true },
        portEnergy: { material: true },
      },
    });
    const s = tabStatuses(m, NONE);
    expect(s.energy.state).toBe("amber");
    expect(s.energy.reasonKeys).toContain("energyParity");
    expect(s.vessels.state).toBe("amber");
    expect(s.vessels.reasonKeys).toContain("portShare");
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
      error: "capitalPhasing.green.weights must sum to 1 (got 1.1)",
      scenario: {
        cargo: { countryId: "other", oneWayDistanceNm: 9500 },
        vessel: { typeId: "tanker-35k" },
        green: { fuelId: "e-ammonia" },
        fossil: { fuelId: "lsfo" },
      },
    });
    // financing carries BOTH the unverified-WACC amber and the phasing red:
    // red must win, visited or not.
    const s = tabStatuses(m, new Set(["financing"]));
    expect(s.financing.state).toBe("red");
  });
});
