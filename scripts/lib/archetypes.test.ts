import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  migrateScenarioInput,
  parseRefBundle,
  parseScenarioInput,
  resolveScenario,
  type ScenarioInput,
} from "@h2map/corridor-schema";
import { evaluateScenario } from "@h2map/corridor-engine";
import { ROOT } from "./serviceDeps";
import { ARCHETYPES, TYPED_BURN_C } from "../corridor/lib/archetypes";

/**
 * The three corridor archetypes the impact measurements run across.
 *
 * What matters here is not that each one evaluates — it is that they remain
 * DIFFERENT in the specific ways the measurements depend on. A drifts into C
 * the moment someone types a burn into it, and the cross-scenario spread that
 * justifies running three scenarios silently becomes noise.
 *
 * So each defining property is asserted by name.
 */

const bundle = parseRefBundle(
  JSON.parse(readFileSync(`${ROOT}data/corridor-ref/2026-08-18-fuel-v4.json`, "utf8")),
);

const input = (key: "A" | "B" | "C"): ScenarioInput =>
  migrateScenarioInput(
    JSON.parse(JSON.stringify(ARCHETYPES.find((a) => a.key === key)!.build())),
  ).input;
const resolved = (key: "A" | "B" | "C") => resolveScenario(input(key), bundle);
const evaluated = (key: "A" | "B" | "C") => evaluateScenario(resolved(key));

describe("every archetype is a valid, evaluable scenario", () => {
  it("round-trips through the stored-scenario schema", () => {
    for (const a of ARCHETYPES) {
      expect(
        () => parseScenarioInput(JSON.parse(JSON.stringify(input(a.key)))),
        `${a.key} ${a.id}`,
      ).not.toThrow();
    }
  });

  it("produces a positive cost gap", () => {
    for (const a of ARCHETYPES) {
      expect(evaluated(a.key).summary.gapPvUsdM, a.key).toBeGreaterThan(0);
    }
  });

  it("keeps both sides energy-matched", () => {
    // Parity is the invariant the coupling rules are built on. An archetype
    // that starts out diverged would make every energy-demand measurement
    // meaningless before a single perturbation is applied.
    for (const a of ARCHETYPES) {
      const p = evaluated(a.key).energyParity;
      expect(p.ratio, a.key).toBeCloseTo(1, 9);
      expect(p.diverged, a.key).toBe(false);
    }
  });
});

describe("the archetypes stay distinct", () => {
  it("A and B derive their burns; C types them", () => {
    // THE DEFINING CONTRAST. C's typed burn is what makes corridor length
    // inert there and a top driver on A — the whole reason for three
    // scenarios rather than one.
    for (const key of ["A", "B"] as const) {
      const r = resolved(key);
      expect(r.green.tonnesPerVesselYear.source, `${key} green`).toBe("derived");
      expect(r.fossil.tonnesPerVesselYear.source, `${key} fossil`).toBe("derived");
    }
    const c = resolved("C");
    expect(c.green.tonnesPerVesselYear.source).toBe("override");
    expect(c.fossil.tonnesPerVesselYear.source).toBe("override");
  });

  it("C's typed burns are the model's OWN derived values, not invented", () => {
    // Re-derive them by releasing the overrides. If the vessel table or an
    // LHV moves, this fails and says so, rather than letting C quietly
    // describe a corridor the model no longer produces.
    const raw = JSON.parse(JSON.stringify(input("C"))) as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    for (const side of ["green", "fossil"] as const) {
      raw[side]!.overrides!.fuelTonnesPerVesselYear = null;
    }
    const r = resolveScenario(raw as unknown as ScenarioInput, bundle);
    expect(r.green.tonnesPerVesselYear.value as number).toBeCloseTo(TYPED_BURN_C.green, 6);
    expect(r.fossil.tonnesPerVesselYear.value as number).toBeCloseTo(TYPED_BURN_C.fossil, 6);
  });

  it("A builds a plant; B buys from a hub", () => {
    // The capital-vs-fuel-price axis. B with a plant would just be A on a
    // different route.
    expect(resolved("A").green.prodCapexUsdM.value as number).toBeGreaterThan(100);
    expect(resolved("B").green.prodCapexUsdM.value as number).toBe(0);
    expect(resolved("B").green.priceUsdPerTonne.value as number).toBeGreaterThan(0);
    expect(resolved("A").green.priceUsdPerTonne.value as number).toBe(0);
  });

  it("B runs on IMO Net-Zero; C on the EU schemes", () => {
    // Regulation is geography, not preference: an Australia-Korea run touches
    // no EEA port, so ETS and FuelEU are off there and live on C.
    const b = input("B");
    expect(b.regulation.ets.enabled).toBe(false);
    expect(b.regulation.fuelEu.enabled).toBe(false);
    expect(b.regulation.imoNetZero?.enabled).toBe(true);
    expect(input("C").regulation.ets.enabled).toBe(true);
  });
});

describe("corridor length behaves differently per archetype", () => {
  /** Central-difference elasticity of the gap w.r.t. one-way distance. */
  const distanceElasticity = (key: "A" | "B" | "C"): number => {
    const at = (factor: number) => {
      const s = JSON.parse(JSON.stringify(input(key))) as ScenarioInput;
      const c = s.cargo as unknown as Record<string, number>;
      c.oneWayDistanceNm = c.oneWayDistanceNm * factor;
      return evaluateScenario(resolveScenario(s, bundle)).summary.gapPvUsdM;
    };
    return (at(1.1) - at(0.9)) / at(1) / 0.2;
  };

  it("is inert on C, where the burn is typed", () => {
    // Exactly zero: with consumption frozen, distance reaches the gap through
    // nothing at all on this archetype.
    expect(Math.abs(distanceElasticity("C"))).toBeLessThan(1e-9);
  });

  it("moves the gap on A, where the burn is derived", () => {
    expect(Math.abs(distanceElasticity("A"))).toBeGreaterThan(0.05);
  });

  it("separates the two by an order of magnitude", () => {
    // The CONTRAST is the assertion, not either value — the exact figures are
    // properties of the reference data and will move with it.
    expect(Math.abs(distanceElasticity("A"))).toBeGreaterThan(
      Math.abs(distanceElasticity("C")) + 0.05,
    );
  });
});
