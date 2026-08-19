import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  migrateScenarioInput,
  parseRefBundle,
  parseUncertaintyDataset,
  resolveScenario,
  type ScenarioInput,
} from "@h2map/corridor-schema";
import { evaluateScenario } from "@h2map/corridor-engine";
import { ROOT } from "./serviceDeps";
import { buildTornado, TORNADO_KPIS } from "../../apps/web/lib/corridor/tornado";
import { ARCHETYPES } from "../corridor/lib/archetypes";

/**
 * The tornado — impact on one scenario, from two real engine evaluations per
 * bar.
 *
 * The values here belong to the reference data and will move with it. What
 * must not move is the SHAPE: a bar straddles the baseline, its ends are
 * evaluations rather than extrapolations, a coupled group is one bar, and a
 * range that cannot act on this scenario is reported rather than dropped.
 */

const bundle = parseRefBundle(
  JSON.parse(readFileSync(`${ROOT}data/corridor-ref/2026-08-18-fuel-v4.json`, "utf8")),
);
const uncertainty = parseUncertaintyDataset(
  JSON.parse(
    readFileSync(
      `${ROOT}data/input-uncertainty-ref/2026-08-19-uncertainty-v1.json`,
      "utf8",
    ),
  ),
);
const scenarioOf = (key: "A" | "B" | "C"): ScenarioInput =>
  migrateScenarioInput(
    JSON.parse(JSON.stringify(ARCHETYPES.find((a) => a.key === key)!.build())),
  ).input;
const tornadoOf = (key: "A" | "B" | "C") =>
  buildTornado(scenarioOf(key), bundle, uncertainty, "gapPvUsdM", key);

describe("every bar is a real evaluation", () => {
  it("draws bars on all three archetypes", () => {
    // Anti-vacuity: an empty tornado satisfies most assertions below.
    for (const key of ["A", "B", "C"] as const) {
      expect(tornadoOf(key).bars.length, key).toBeGreaterThan(2);
    }
  });

  it("reproduces a two-point engine evaluation exactly", () => {
    // THE LOAD-BEARING TEST. The bar ends must BE engine results, not an
    // elasticity multiplied by a range width — the elasticity artifact
    // already flags asymmetric fields, so the model is known to be
    // non-linear in places and extrapolation would silently lie there.
    const s = scenarioOf("A");
    const bar = tornadoOf("A").bars.find((b) => b.id === "cargo.wacc")!;
    const row = uncertainty.rows.find(
      (r) => r.id === "cargo.wacc" && (r.scenarioScope ?? []).includes("A"),
    )!;
    const at = (points: number) => {
      const copy = JSON.parse(JSON.stringify(s)) as Record<string, Record<string, unknown>>;
      copy.cargo!.waccOverride = points / 100;
      return evaluateScenario(
        resolveScenario(copy as unknown as ScenarioInput, bundle),
      ).summary.gapPvUsdM;
    };
    expect(bar.low).toBeCloseTo(at(row.low), 9);
    expect(bar.high).toBeCloseTo(at(row.high), 9);
  });

  it("straddles the baseline on every bar", () => {
    // A bar with both ends on one side of the base is not a tornado — it is a
    // level change. That was a real defect: archetype B carries $35m fossil
    // vessel CAPEX while its Newcastlemax band runs 70-82, so setting the
    // bound directly measured a jump from 35 to 70 PLUS a range, and drew
    // 518..543 against a base of 446.
    for (const key of ["A", "B", "C"] as const) {
      const t = tornadoOf(key);
      for (const b of t.bars) {
        const lo = Math.min(b.low, b.high);
        const hi = Math.max(b.low, b.high);
        expect(lo, `${key} ${b.id} low`).toBeLessThanOrEqual(t.base);
        expect(hi, `${key} ${b.id} high`).toBeGreaterThanOrEqual(t.base);
      }
    }
  });

  it("sorts by span, largest first", () => {
    const spans = tornadoOf("A").bars.map((b) => b.span);
    expect([...spans].sort((a, b) => b - a)).toEqual(spans);
  });
});

describe("units are applied correctly", () => {
  it("treats a WACC range as PERCENTAGE POINTS", () => {
    // THE SILENT-FAILURE GUARD. Setting 6 where the engine wants 0.06 gives a
    // gap of $1,371.9m against the correct $1,779.3m — no error, no warning, a
    // plausible number that is simply wrong. The bar's ends must match the
    // /100 interpretation, and must NOT match the raw one.
    const s = scenarioOf("A");
    const bar = tornadoOf("A").bars.find((b) => b.id === "cargo.wacc")!;
    const rawUnits = (() => {
      const copy = JSON.parse(JSON.stringify(s)) as Record<string, Record<string, unknown>>;
      copy.cargo!.waccOverride = bar.rangeLow; // 6, not 0.06
      return evaluateScenario(
        resolveScenario(copy as unknown as ScenarioInput, bundle),
      ).summary.gapPvUsdM;
    })();
    expect(bar.low).not.toBeCloseTo(rawUnits, 3);
  });

  it("keeps a fractional range relative to the scenario's own value", () => {
    // `energy-demand` is "+/-x of delivered energy", so it scales what the
    // corridor already burns rather than setting an absolute tonnage.
    const bar = tornadoOf("A").bars.find((b) => b.id === "energy-demand")!;
    expect(bar.rangeLow).toBeLessThan(0);
    expect(bar.rangeHigh).toBeGreaterThan(0);
    expect(bar.unit).toMatch(/^fraction of/);
  });
});

describe("coupled groups are one bar", () => {
  it("marks group rows as coupled", () => {
    const t = tornadoOf("A");
    for (const id of ["energy-demand", "fleet-capital", "vessel-opex"]) {
      const bar = t.bars.find((b) => b.id === id);
      if (bar) expect(bar.coupled, id).toBe(true);
    }
  });

  it("never draws a group's members separately", () => {
    // The whole point of a group: the sweep's double-counted pair becomes one
    // honest bar. A member id appearing on its own would restore the fault.
    const ids = tornadoOf("A").bars.map((b) => b.id);
    for (const member of [
      "vessel.green.capexUsdM",
      "vessel.fossil.capexUsdM",
      "green.fuelTonnesPerVesselYear",
    ]) {
      expect(ids).not.toContain(member);
    }
  });
});

describe("what cannot be drawn is reported, not dropped", () => {
  it("explains the e-methanol price on archetype C", () => {
    // C runs methanol but BUILDS it, so its resolved merchant price is 0 and
    // there is nothing to perturb. A silently missing bar would read as "this
    // does not matter here", which is a different claim.
    const t = tornadoOf("C");
    expect(t.bars.map((b) => b.id)).not.toContain("green.priceUsdPerTonne");
    const skipped = t.inapplicable.find((i) => i.id === "green.priceUsdPerTonne");
    expect(skipped, "must be reported, not dropped").toBeDefined();
    expect(skipped!.reason.length).toBeGreaterThan(5);
  });

  it("never applies a scoped range outside its scope", () => {
    // The methanol range must not appear on the ammonia archetypes at all —
    // not as a bar, and not as an inapplicable entry, because it was never
    // declared for them.
    for (const key of ["A", "B"] as const) {
      const t = tornadoOf(key);
      expect(t.bars.map((b) => b.id)).not.toContain("green.priceUsdPerTonne");
      expect(t.inapplicable.map((i) => i.id)).not.toContain("green.priceUsdPerTonne");
    }
  });
});

describe("the panel cannot crash on a missing label", () => {
  it("has an i18n label for every drawable row id and every KPI", () => {
    // next-intl THROWS on a missing key, so a row or KPI without a label
    // takes the whole results panel down. This was a real defect: the KPI
    // selector offered co2AbatedTonnes after that key had been removed in an
    // earlier trim, so choosing it would have crashed the page.
    const messages = JSON.parse(
      readFileSync(`${ROOT}apps/web/messages/en/corridor.json`, "utf8"),
    ) as { corridor: { results: Record<string, Record<string, string>> } };
    const results = messages.corridor.results;
    for (const id of new Set(uncertainty.rows.map((r) => r.id))) {
      expect(results.tornadoRow?.[id], `tornadoRow.${id}`).toBeDefined();
    }
    for (const k of TORNADO_KPIS) {
      expect(results.kpi?.[k], `kpi.${k}`).toBeDefined();
    }
  });
});
