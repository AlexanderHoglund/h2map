/**
 * Published-study acceptance: does the model derive what real corridor
 * feasibility studies published?
 *
 * These are the tests the vessel work exists to pass. Each runs with
 * `fuelTonnesPerVesselYear` left NULL — the whole point is that the burn
 * DERIVES from corridor geometry and the vessel type, rather than being
 * hand-typed to match. A scenario that only reproduces a study because
 * someone typed the study's own number into it proves nothing.
 *
 * The catalogue's energy figures for these hulls now come from the studies
 * themselves (bundle 2026-08-21-cruise-v6), so reproduction is by
 * construction and these tests are guards that it STAYS reproduced — not
 * evidence that the EEDI derivation was right. That separate finding, that
 * the raw reference line runs 37-52% high against every study, is pinned in
 * gmfValidation.test.ts and must not be erased.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseRefBundle,
  resolveScenario,
  migrateScenarioInput,
  type ScenarioInput,
} from "@h2map/corridor-schema";

const bundle = parseRefBundle(
  JSON.parse(
    readFileSync(
      new URL("../../../data/corridor-ref/2026-08-21-cruise-v6.json", import.meta.url),
      "utf8",
    ),
  ),
);

const base = (): ScenarioInput =>
  migrateScenarioInput(
    JSON.parse(
      readFileSync(
        new URL("../../../fixtures/golden/corridor/excel-baseline.input.json", import.meta.url),
        "utf8",
      ),
    ) as unknown,
  ).input;

/** Derived green burn, t/vessel/yr, with NOTHING overridden. */
function derivedBurn(edit: (s: ScenarioInput) => void): number {
  const s = base();
  s.refBundleId = bundle.bundleId;
  s.green.fuelId = "e-ammonia";
  s.green.overrides.fuelTonnesPerVesselYear = null;
  // The studies state ammonia tonnages, so pin the LHV to the fuel table
  // rather than the refined-emissions blend, which would fold pilot fuel in.
  s.green.overrides.lhvMjPerTonne = 18_600;
  edit(s);
  return resolveScenario(s, bundle).green.tonnesPerVesselYear.value as number;
}

describe("published-study acceptance", () => {
  it("GMF/RMI iron ore: 16,440 t NH3/vessel/yr within 2%", () => {
    // South Africa-Europe, Newcastlemax, 6,166 nm x 6 round trips.
    const t = derivedBurn((s) => {
      s.vessel.typeId = "bulk-newcastlemax-210k";
      s.cargo = { ...s.cargo, oneWayDistanceNm: 6166, roundtripsPerYear: 6 };
    });
    expect(Math.abs(t / 16_440 - 1)).toBeLessThan(0.02);
  });

  it("MMMCZCS Bahia-Algeciras: 20,250 t NH3/vessel/yr within 2%", () => {
    // VLAC, 6,316 nm x 9 round trips. searoute returns 6,316 against the
    // study's stated 6,312 (0.06%), so the geometry is independently right.
    const t = derivedBurn((s) => {
      s.vessel.typeId = "vlac-93k";
      s.cargo = { ...s.cargo, oneWayDistanceNm: 6316, roundtripsPerYear: 9 };
    });
    expect(Math.abs(t / 20_250 - 1)).toBeLessThan(0.02);
  });

  it("MMMCZCS sulfuric acid: 10,000 t NH3/vessel/yr within 5%", () => {
    // 786 nm x 20 round trips. Wider tolerance deliberately: this study's
    // figure is an ANNUAL RESIDUAL containing steaming, port load and cargo
    // heating with no way to separate them, so it is a bracketing case
    // rather than a measurement of a steaming rate.
    const t = derivedBurn((s) => {
      s.vessel.typeId = "chem-imo2-25k";
      s.cargo = { ...s.cargo, oneWayDistanceNm: 786, roundtripsPerYear: 20 };
    });
    expect(Math.abs(t / 10_000 - 1)).toBeLessThan(0.05);
  });

  it("derives — it does not read back a typed-in answer", () => {
    // The guard that makes the three above mean something. If the burn were
    // overridden, changing the geometry would not move it.
    const short = derivedBurn((s) => {
      s.vessel.typeId = "vlac-93k";
      s.cargo = { ...s.cargo, oneWayDistanceNm: 3158, roundtripsPerYear: 9 };
    });
    const long = derivedBurn((s) => {
      s.vessel.typeId = "vlac-93k";
      s.cargo = { ...s.cargo, oneWayDistanceNm: 6316, roundtripsPerYear: 9 };
    });
    expect(long / short).toBeCloseTo(2, 6);
  });
});
