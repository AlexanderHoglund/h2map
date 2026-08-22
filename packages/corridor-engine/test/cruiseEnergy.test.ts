/**
 * The cruise third energy term (bundle 2026-08-21-cruise-v6, waves C1-C5).
 *
 * A cruise ship's hotel burns fuel every day of the year regardless of
 * speed. Folding that into gjPerNm (the 2-term construction) scales hotel
 * energy with v² — the MRV closure test on MSC World Europa puts that at
 * −20% under slow steaming. So cruise rows carry a PROPULSION-ONLY gjPerNm
 * plus hotelLoadGjPerDay, and the resolver adds hotel × 365 per vessel-year
 * OUTSIDE the speed factor.
 *
 * The properties pinned here are exactly the closure test's:
 *  - annual energy = 2·nm·gjPerNm·v²·roundtrips + hotel×365
 *  - a speed change moves ONLY the propulsion term
 *  - the hotel term is invariant to distance and itinerary
 *  - rows without the field (every cargo ship) are byte-identical to v5 —
 *    the additive property.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseRefBundle,
  resolveScenario,
  type ScenarioInput,
} from "@h2map/corridor-schema";
import { evaluateScenario } from "../src/index";
import {
  defaultScenario,
  emptyScenario,
} from "../../../apps/web/lib/corridor/scenarioDefaults";

const load = (id: string) =>
  parseRefBundle(
    JSON.parse(
      readFileSync(
        new URL(`../../../data/corridor-ref/${id}.json`, import.meta.url),
        "utf8",
      ),
    ),
  );

const v5 = load("2026-08-21-verified-v5");
const v6 = load("2026-08-21-cruise-v6");

/** A premium-class deployment loop: 1,500 nm itinerary, 45 loops/yr. */
function cruiseLoop(): ScenarioInput {
  const s: ScenarioInput = { ...emptyScenario(), refBundleId: v6.bundleId };
  s.vessel = { ...s.vessel, typeId: "cruise-premium-2400" };
  s.cargo = {
    ...s.cargo,
    unit: "passenger",
    oneWayDistanceNm: 750,
    roundtripsPerYear: 45,
    vessels: 1,
    unitsPerYear: 2400 * 45,
  };
  return s;
}

const ROW = v6.vesselTypes.find((v) => v.id === "cruise-premium-2400")!;

describe("cruise three-term energy", () => {
  it("annual fuel = (2·nm·gjPerNm·roundtrips + hotel×365) / lhv", () => {
    const r = resolveScenario(cruiseLoop(), v6);
    const lhv = r.green.lhv.value as number;
    const expectGj =
      2 * 750 * ROW.gjPerNm * 45 + ROW.hotelLoadGjPerDay! * 365;
    expect(r.green.tonnesPerVesselYear.value).toBeCloseTo(
      (expectGj * 1000) / lhv,
      1,
    );
  });

  it("slow steaming moves ONLY the propulsion term (the −20% closure case)", () => {
    const slow = cruiseLoop();
    slow.cargo = { ...slow.cargo, serviceSpeedKn: ROW.serviceSpeedKn! * 0.8 };
    const r = resolveScenario(slow, v6);
    const lhv = r.green.lhv.value as number;
    const expectGj =
      2 * 750 * ROW.gjPerNm * 0.8 ** 2 * 45 + ROW.hotelLoadGjPerDay! * 365;
    expect(r.green.tonnesPerVesselYear.value).toBeCloseTo(
      (expectGj * 1000) / lhv,
      1,
    );
  });

  it("the hotel term is invariant to itinerary: same annual hotel GJ at any loop count", () => {
    const hotelTonnes = (roundtrips: number, nm: number) => {
      const s = cruiseLoop();
      s.cargo = { ...s.cargo, roundtripsPerYear: roundtrips, oneWayDistanceNm: nm };
      const r = resolveScenario(s, v6);
      const lhv = r.green.lhv.value as number;
      const propulsion = 2 * nm * ROW.gjPerNm * roundtrips;
      return (
        (r.green.tonnesPerVesselYear.value as number) -
        (propulsion * 1000) / lhv
      );
    };
    const a = hotelTonnes(45, 750);
    const b = hotelTonnes(12, 2600);
    expect(a).toBeCloseTo(b, 6);
  });

  it("cruise rows carry no port term — the hotel term includes berth days", () => {
    expect(ROW.portGjPerDay).toBe(0);
    expect(ROW.cargoSystemGjPerDay).toBe(0);
    const res = evaluateScenario(resolveScenario(cruiseLoop(), v6));
    expect(res.portEnergy?.share ?? 0).toBe(0);
    expect(res.portEnergy?.material ?? false).toBe(false);
  });

  it("ADDITIVITY: cargo scenarios evaluate byte-identically on v5 and v6", () => {
    for (const make of [defaultScenario, emptyScenario]) {
      const r5 = evaluateScenario(
        resolveScenario({ ...make(), refBundleId: v5.bundleId }, v5),
      );
      const r6 = evaluateScenario(
        resolveScenario({ ...make(), refBundleId: v6.bundleId }, v6),
      );
      expect(JSON.stringify(r6)).toBe(JSON.stringify(r5));
    }
  });
});
