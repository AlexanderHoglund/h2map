/**
 * Port energy share.
 *
 * The vessel catalogue carries port, idle and cargo-system day rates, and
 * every one of them is a tier-C sector estimate — the largest unsourced
 * term in the bundle. A raw GJ/day cannot tell a user whether that
 * uncertainty matters to them; the SHARE of round-trip energy can, and it
 * is a property of the corridor rather than the vessel.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseRefBundle,
  resolveScenario,
  type ScenarioInput,
} from "@h2map/corridor-schema";
import { evaluateScenario } from "../src/index";
import { emptyScenario } from "../../../apps/web/lib/corridor/scenarioDefaults";

const load = (id: string) =>
  parseRefBundle(
    JSON.parse(
      readFileSync(
        new URL(`../../../data/corridor-ref/${id}.json`, import.meta.url),
        "utf8",
      ),
    ),
  );

const v2 = load("2026-08-16-vessel-v2");
const v1 = load("2026-07-30-excel-v1");

function share(typeId: string, oneWayDistanceNm: number, bundle = v2) {
  const s: ScenarioInput = {
    ...emptyScenario(),
    refBundleId: bundle.bundleId,
  };
  s.vessel.typeId = typeId;
  s.cargo = { ...s.cargo, oneWayDistanceNm };
  return evaluateScenario(resolveScenario(s, bundle)).portEnergy;
}

describe("port energy share", () => {
  it("is negligible on a long corridor and material on a short one", () => {
    // The whole point: the SAME ship, two corridors, opposite conclusions.
    const long = share("bulk-newcastlemax-210k", 9500)!;
    const short = share("bulk-newcastlemax-210k", 786)!;
    expect(long.share).toBeLessThan(0.01);
    expect(short.share).toBeGreaterThan(10 * long.share);
  });

  it("escalates past ~10% for a cargo-system-heavy ship on a short run", () => {
    // A chemical tanker runs heating and pumps in port, so its share climbs
    // fastest as the corridor shortens.
    const chem = share("chem-imo2-25k", 786)!;
    expect(chem.share).toBeGreaterThan(0.2);
    expect(chem.material).toBe(true);
    // ...and stays immaterial on the long haul, where it is a rounding error.
    expect(share("chem-imo2-25k", 9500)!.material).toBe(false);
  });

  it("scales linearly with the stated port-day assumption", () => {
    // The assumption is stated, not hidden, precisely because the share is
    // linear in it — a reader doubling the port days doubles the share.
    const p = share("bulk-newcastlemax-210k", 786)!;
    expect(p.portDaysPerRoundTrip).toBe(4);
    expect(p.portGjPerRoundTrip / p.portDaysPerRoundTrip).toBeGreaterThan(0);
    expect(p.share).toBeCloseTo(
      p.portGjPerRoundTrip / (p.portGjPerRoundTrip + p.steamingGjPerRoundTrip),
      12,
    );
  });

  it("reports NOTHING on a bundle without day rates, not zero", () => {
    // "Unknown" and "negligible" must not look alike. The 2026-07-30 bundle
    // carries no day rates, so there is no share to report.
    const s: ScenarioInput = { ...emptyScenario(), refBundleId: v1.bundleId };
    const r = evaluateScenario(resolveScenario(s, v1));
    expect(r.portEnergy).toBeUndefined();
  });

  it("leaves the abated figure and the gap untouched", () => {
    // Disclosure only — the share is reported beside the result, never
    // folded into it. (Port fuel is not currently in the burn at all; if it
    // ever is, that is a modelling change requiring its own decision.)
    const s: ScenarioInput = { ...emptyScenario(), refBundleId: v2.bundleId };
    s.vessel.typeId = "chem-imo2-25k";
    s.cargo = { ...s.cargo, oneWayDistanceNm: 786 };
    const r = evaluateScenario(resolveScenario(s, v2));
    expect(r.portEnergy!.material).toBe(true);
    expect(Number.isFinite(r.summary.gapPvUsdM)).toBe(true);
    expect(Number.isFinite(r.summary.co2AbatedTonnes)).toBe(true);
  });
});
