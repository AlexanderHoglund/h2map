import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROOT } from "./serviceDeps";
import { KPIS, PARAMS } from "../corridor/lib/params";

/**
 * The sweep's parameter table, after it was extracted out of
 * `sensitivity.ts` so more than one harness could use it.
 *
 * THE REFACTOR IS INVISIBLE TO EVERY EXISTING GATE. `sensitivity.ts --check`
 * compares only the top-level id SET, and the docs byte-gate regenerates FROM
 * the stored artifact — so moving the table could have silently changed a
 * number and nothing in CI would have said so. The committed artifact is
 * therefore the assertion: the ids, their order, and their ranges must still
 * be exactly what produced `sensitivity.json`.
 *
 * That also makes this the guard for the extraction's real risk — a param
 * dropped or reordered during the move.
 */

const artifact = JSON.parse(
  readFileSync(`${ROOT}data/corridor-sensitivity/sensitivity.json`, "utf8"),
) as {
  ranked: {
    id: string;
    range: readonly (string | number)[];
    signedByKpi: {
      gapPvUsdM: { atLow: number; atHigh: number };
      costPerTonneCo2Usd: { atLow: number; atHigh: number };
    } | null;
  }[];
  kpis: { id: string }[];
};

describe("the extracted parameter table still describes the committed artifact", () => {
  it("sweeps a non-trivial number of parameters", () => {
    // Anti-vacuity: an empty import would make every comparison below pass.
    expect(PARAMS.length).toBeGreaterThan(50);
    expect(artifact.ranked.length).toBeGreaterThan(50);
  });

  it("covers exactly the ids the artifact ranks", () => {
    expect([...PARAMS.map((p) => p.id)].sort()).toEqual(
      [...artifact.ranked.map((r) => r.id)].sort(),
    );
  });

  it("keeps every range identical", () => {
    // The ranges ARE the sweep's result — a moved endpoint changes every
    // movement figure downstream while leaving the id set untouched, which
    // is precisely what --check cannot see.
    const ranges = new Map(artifact.ranked.map((r) => [r.id, r.range]));
    for (const p of PARAMS) {
      const expected = ranges.get(p.id)!;
      const actual = p.options ? [...p.options] : [p.low, p.high];
      expect(actual, p.id).toEqual([...expected]);
    }
  });

  it("declares each parameter exactly once", () => {
    const ids = PARAMS.map((p) => p.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it("gives every parameter a setter matching its kind", () => {
    // A numeric param with no `set`, or an enum with no `setOption`, is
    // skipped in silence by the sweep rather than failing.
    for (const p of PARAMS) {
      if (p.options) {
        expect(typeof p.setOption, p.id).toBe("function");
      } else {
        expect(typeof p.set, p.id).toBe("function");
        expect(typeof p.low, p.id).toBe("number");
        expect(typeof p.high, p.id).toBe("number");
      }
    }
  });

  it("keeps the six KPIs in the artifact's order", () => {
    expect(KPIS.map((k) => k.id)).toEqual(artifact.kpis.map((k) => k.id));
  });

  it("records opposite-signed abatement endpoints for corridor length", () => {
    // The honesty fix behind the signed display: the abatement cost RISES
    // toward the short end of the distance range (+366% at 100 nm) and FALLS
    // toward the far end (−82% at 5,000 nm). A max-abs figure collapsed that
    // into "366%" — if these endpoints ever stop disagreeing in sign, the
    // docs' whole ratio-amplification explanation is stale.
    const row = artifact.ranked.find((r) => r.id === "cargo.oneWayDistanceNm")!;
    const s = row.signedByKpi!.costPerTonneCo2Usd;
    expect(s.atLow).toBeGreaterThan(0);
    expect(s.atHigh).toBeLessThan(0);
  });
});

describe("choice option lists match the bundle catalogue", () => {
  // The option lists are literals in params.ts; the catalogue is data. An
  // option added to the bundle but absent from the sweep would silently
  // vanish from the impact ranking — these fail loudly instead.
  const bundle = JSON.parse(
    readFileSync(`${ROOT}data/corridor-ref/2026-08-18-fuel-v4.json`, "utf8"),
  ) as {
    fuels: { id: string; family: string }[];
    vesselTypes: { id: string; deprecated?: boolean }[];
    countries: { id: string }[];
  };
  const options = (id: string) =>
    [...(PARAMS.find((p) => p.id === id)?.options ?? [])].sort();

  it("green fuels", () => {
    expect(options("green.fuelId")).toEqual(
      bundle.fuels.filter((f) => f.family === "green").map((f) => f.id).sort(),
    );
  });

  it("fossil fuels", () => {
    expect(options("fossil.fuelId")).toEqual(
      bundle.fuels.filter((f) => f.family === "fossil").map((f) => f.id).sort(),
    );
  });

  it("non-retired vessel classes", () => {
    expect(options("vessel.typeId")).toEqual(
      bundle.vesselTypes.filter((v) => !v.deprecated).map((v) => v.id).sort(),
    );
  });

  it("countries", () => {
    expect(options("cargo.countryId")).toEqual(
      bundle.countries.map((c) => c.id).sort(),
    );
  });

  it("engine types match the fuel-emissions dataset", () => {
    const fe = JSON.parse(
      readFileSync(
        `${ROOT}data/fuel-emissions-ref/2026-08-17-ets-carbon-4.json`,
        "utf8",
      ),
    ) as { methaneSlip: { byEngine: { engine: string }[] } };
    expect(options("green.emissions.engineType")).toEqual(
      fe.methaneSlip.byEngine.map((e) => e.engine).sort(),
    );
  });
});
