import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRefBundle } from "../src/ref/bundle";
import { resolveScenario } from "../src/resolve";
import { migrateScenarioInput } from "../src/migrate";
import type { RefBundle } from "../src/ref/bundle";
import type { ScenarioInput } from "../src/scenario";

/**
 * Port and barge capital keys on the FUEL, not on the side.
 *
 * The old rule branched on `isFossil`, which is not a property of the fuel —
 * it is which side of the comparison the fuel happens to sit on. It then
 * substituted `benchmarkRules.fossilPortCapexUsdM` (zero) for the row's own
 * figure, so the data was discarded rather than merely overridden.
 *
 * Two consequences, both wrong:
 *
 *  - LNG is fossil and needs a full cryogenic terminal plus a bunker vessel.
 *    It already carried $8m port and $3m barge in the bundle and the fossil
 *    side zeroed both.
 *  - The identical fuel on the green side got its real costs, so a property
 *    of the comparison decided a property of the infrastructure.
 *
 * The real question is whether the fuel rides infrastructure that already
 * exists at a commercial bunker port. These tests pin that, and pin that a
 * bundle published before the flag behaves exactly as it used to — which is
 * what lets a saved scenario reproduce its original numbers.
 */

const V3_URL = new URL(
  "../../../data/corridor-ref/2026-08-17-vessel-v3.json",
  import.meta.url,
);

/** The shipped v3 bundle, with no `incumbentInfrastructure` anywhere. */
function legacyBundle(): RefBundle {
  return parseRefBundle(JSON.parse(readFileSync(V3_URL, "utf8")));
}

/** v3 plus the flag: true only where the infrastructure genuinely exists. */
function taggedBundle(): RefBundle {
  const raw = JSON.parse(readFileSync(V3_URL, "utf8")) as {
    fuels: Record<string, unknown>[];
  };
  const incumbent = new Set(["lsfo", "biodiesel-hvo"]);
  for (const f of raw.fuels) {
    f.incumbentInfrastructure = incumbent.has(f.id as string);
  }
  return parseRefBundle(raw);
}

/** The golden fixture, migrated, with the fossil fuel swapped and unpinned. */
function scenario(fossilFuelId: string, bundleId: string): ScenarioInput {
  const s = migrateScenarioInput(
    JSON.parse(
      readFileSync(
        new URL(
          "../../../fixtures/golden/corridor/excel-baseline.input.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as unknown,
  ).input;
  s.refBundleId = bundleId;
  s.fossil.fuelId = fossilFuelId;
  s.fossil.sourcing = "purchase";
  for (const k of [
    "portStorageCapexUsdM",
    "portStorageOpexUsdMPerYear",
    "bargeCapexUsdM",
    "bargeOpexUsdMPerYear",
  ] as const) {
    s.fossil.overrides[k] = null;
    s.green.overrides[k] = null;
  }
  return s;
}

describe("a bundle without the flag is untouched", () => {
  it("resolves port and barge exactly as the side rule did", () => {
    // THE BACKWARD-COMPATIBILITY PROPERTY. Reference bundles are immutable;
    // a scenario pinning an older one must reproduce its original numbers,
    // so the absent flag has to fall back to the side branch byte for byte.
    const b = legacyBundle();
    const r = resolveScenario(scenario("lsfo", b.bundleId), b);
    expect(r.fossil.portStorageCapexUsdM.value).toBe(
      b.benchmarkRules.fossilPortCapexUsdM,
    );
    expect(r.fossil.bargeCapexUsdM.value).toBe(b.benchmarkRules.fossilPortCapexUsdM);
    const row = b.fuels.find((f) => f.id === "lsfo")!;
    expect(r.fossil.portStorageOpexUsdMPerYear.value).toBeCloseTo(
      row.portStorageOpexUsdMPerYear * b.benchmarkRules.fossilPortLogisticsOpexFactor,
      12,
    );
  });

  it("still discards LNG's real terminal on the fossil side — the old defect", () => {
    // Kept as a test rather than deleted, so the thing being fixed is on the
    // record and a future reader can see it was deliberate, not incidental.
    const b = legacyBundle();
    const row = b.fuels.find((f) => f.id === "lng")!;
    expect(row.portStorageCapexUsdM).toBeGreaterThan(0);
    expect(row.bargeCapexUsdM).toBeGreaterThan(0);

    const r = resolveScenario(scenario("lng", b.bundleId), b);
    expect(r.fossil.portStorageCapexUsdM.value).toBe(0);
    expect(r.fossil.bargeCapexUsdM.value).toBe(0);
  });
});

describe("with the flag, the fuel decides", () => {
  const b = taggedBundle();

  it("LNG carries its cryogenic terminal even on the fossil side", () => {
    // The fix. LNG is fossil AND needs new infrastructure; those are
    // different questions and the model now asks the second one.
    const row = b.fuels.find((f) => f.id === "lng")!;
    const r = resolveScenario(scenario("lng", b.bundleId), b);
    expect(r.fossil.portStorageCapexUsdM.value).toBe(row.portStorageCapexUsdM);
    expect(r.fossil.bargeCapexUsdM.value).toBe(row.bargeCapexUsdM);
    expect(r.fossil.portStorageCapexUsdM.value as number).toBeGreaterThan(0);
  });

  it("LSFO still pays nothing — the zero was right for exactly one fuel", () => {
    const r = resolveScenario(scenario("lsfo", b.bundleId), b);
    expect(r.fossil.portStorageCapexUsdM.value).toBe(0);
    expect(r.fossil.bargeCapexUsdM.value).toBe(0);
  });

  it("the 0.3 logistics factor follows the incumbency, not the side", () => {
    // The factor meant "existing infrastructure, so only a share of the
    // logistics O&M". That reasoning belongs to incumbency; applying it to
    // LNG would discount the O&M of a terminal nobody has built yet.
    const rowLng = b.fuels.find((f) => f.id === "lng")!;
    const rowLsfo = b.fuels.find((f) => f.id === "lsfo")!;
    const lng = resolveScenario(scenario("lng", b.bundleId), b);
    const lsfo = resolveScenario(scenario("lsfo", b.bundleId), b);

    expect(lng.fossil.portStorageOpexUsdMPerYear.value).toBe(
      rowLng.portStorageOpexUsdMPerYear,
    );
    expect(lsfo.fossil.portStorageOpexUsdMPerYear.value).toBeCloseTo(
      rowLsfo.portStorageOpexUsdMPerYear * b.benchmarkRules.fossilPortLogisticsOpexFactor,
      12,
    );
  });

  it("the same fuel costs the same on either side", () => {
    // The deepest property: infrastructure cost is a fact about the fuel, so
    // moving it between sides must not change it. Under the old rule this
    // was false for every non-incumbent fuel.
    const green = resolveScenario(scenario("lsfo", b.bundleId), b);
    const row = b.fuels.find((f) => f.id === "e-ammonia")!;
    expect(green.green.portStorageCapexUsdM.value).toBe(row.portStorageCapexUsdM);
    expect(green.green.bargeCapexUsdM.value).toBe(row.bargeCapexUsdM);
  });

  it("an override still wins", () => {
    const s = scenario("lng", b.bundleId);
    s.fossil.overrides.portStorageCapexUsdM = 99;
    const r = resolveScenario(s, b);
    expect(r.fossil.portStorageCapexUsdM.value).toBe(99);
    expect(r.fossil.portStorageCapexUsdM.source).toBe("override");
  });
});
