import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrateScenarioInput, parseRefBundle, resolveScenario, type ScenarioInput } from "@h2map/corridor-schema";
import { evaluateScenario } from "@h2map/corridor-engine";
import { ROOT } from "./serviceDeps";
import {
  computeLiveElasticity,
  rankedEntries,
  DETAIL_ONLY,
  ELASTICITY_KPIS,
  LIVE_EXCLUDED,
  LIVE_GROUPS,
  LIVE_PARAMS,
  type ElasticityKpi,
} from "../../apps/web/lib/corridor/elasticityLive";
import { emptyScenario, workbookScenario } from "../../apps/web/lib/corridor/scenarioDefaults";
import { ARCHETYPES } from "../corridor/lib/archetypes";
import { COUPLING_GROUPS, PARAMS, perturbationType } from "../corridor/lib/params";

/**
 * The LIVE elasticity — "what moves it most", computed on the scenario in
 * front of the user rather than on a reference corridor.
 *
 * The acceptance tests below are the plan's tests 1–6, pinned against two
 * corridors anyone can reproduce in the app: the Simplified starter template
 * ("user corridor": 5,000 nm, 5 vessels, 10 roundtrips, 15 years,
 * purchase/purchase) and the frozen 500 nm sweep-baseline corridor
 * ("reference corridor").
 *
 * ONE DELIBERATE DEVIATION from the plan's quoted figures: the plan expected
 * the user corridor's distance→abatement elasticity at −0.34. That figure is
 * the one-sided UP estimate; the plan's own definition (the signed central
 * difference, (f(1.1x)−f(0.9x))/0.2) measures −0.372 here, and its own
 * identity test (E_abatement = E_gap − E_tonnes = 0.632 − 1.000 ≈ −0.37)
 * forces the same value — −0.34 and the identity cannot both hold. The
 * central value is pinned; the one-sided −0.335/−0.409 pair is what the
 * nonlinearity flag exists to disclose.
 */

const bundleCurrent = parseRefBundle(
  JSON.parse(readFileSync(`${ROOT}data/corridor-ref/2026-08-18-fuel-v4.json`, "utf8")),
);
const bundleFrozen = parseRefBundle(
  JSON.parse(readFileSync(`${ROOT}data/corridor-ref/2026-07-30-excel-v1.json`, "utf8")),
);

/** The user corridor: the Simplified starter template, as the app builds it. */
const user = computeLiveElasticity(emptyScenario(), bundleCurrent)!;

/** The reference corridor: the sweep's own baseline posture, frozen bundle. */
const referenceScenario = (): ScenarioInput => {
  const raw = workbookScenario();
  raw.flags = { ...(raw.flags ?? {}), emissionsBasis: "wellToWake" };
  return migrateScenarioInput(JSON.parse(JSON.stringify(raw))).input;
};
const reference = computeLiveElasticity(referenceScenario(), bundleFrozen)!;

const entry = (r: typeof user, id: string) => r.entries.find((e) => e.id === id);
const val = (r: typeof user, id: string, kpi: ElasticityKpi) =>
  entry(r, id)!.perKpi[kpi].value;

describe("acceptance 1 — the user corridor ranks distance above WACC on abatement", () => {
  it("is the corridor the plan describes", () => {
    const s = emptyScenario();
    expect(s.cargo.oneWayDistanceNm).toBe(5000);
    expect(s.cargo.vessels).toBe(5);
    expect(s.cargo.roundtripsPerYear).toBe(10);
    expect(s.cargo.horizonYears).toBe(15);
    expect(s.green.sourcing).toBe("purchase");
    expect(s.fossil.sourcing).toBe("purchase");
    const res = evaluateScenario(resolveScenario(s, bundleCurrent));
    expect(res.intermediates.greenFuelTonnesPerVesselYear).toBeCloseTo(12548.4, 1);
    expect(res.intermediates.fossilFuelTonnesPerVesselYear).toBeCloseTo(5763.0, 1);
  });

  it("measures distance −0.372 and WACC −0.284 on the abatement cost", () => {
    // Central differences (see the header on why −0.372, not the plan's
    // one-sided −0.34). Signed: both FALL as the input rises.
    expect(val(user, "cargo.oneWayDistanceNm", "costPerTonneCo2Usd")).toBeCloseTo(-0.372, 2);
    expect(val(user, "cargo.wacc", "costPerTonneCo2Usd")).toBeCloseTo(-0.284, 2);
  });

  it("ranks distance above WACC", () => {
    expect(Math.abs(val(user, "cargo.oneWayDistanceNm", "costPerTonneCo2Usd"))).toBeGreaterThan(
      Math.abs(val(user, "cargo.wacc", "costPerTonneCo2Usd")),
    );
    // And WACC tops its own family: the two families never share an ordering.
    const pp = rankedEntries(user, "costPerTonneCo2Usd", "absolutePp");
    expect(pp[0]!.id).toBe("cargo.wacc");
  });

  it("flags the distance→abatement curvature instead of averaging it away", () => {
    // Up −0.335 vs down −0.409: the tonnes denominator makes 1/x curvature,
    // and a single number cannot carry that honestly.
    const d = entry(user, "cargo.oneWayDistanceNm")!.perKpi.costPerTonneCo2Usd;
    expect(d.nonlinear).toBe(true);
    expect(d.up).toBeCloseTo(-0.335, 2);
    expect(d.down).toBeCloseTo(-0.409, 2);
  });
});

describe("acceptance 2 — the sign flips across output tabs and is preserved", () => {
  it("measures distance +0.632 on the gap of the same scenario", () => {
    expect(val(user, "cargo.oneWayDistanceNm", "gapPvUsdM")).toBeCloseTo(0.632, 2);
  });

  it("renders opposite signs for the same input on different tabs", () => {
    const d = entry(user, "cargo.oneWayDistanceNm")!;
    expect(Math.sign(d.perKpi.gapPvUsdM.value)).toBe(1);
    expect(Math.sign(d.perKpi.costPerTonneCo2Usd.value)).toBe(-1);
  });
});

describe("acceptance 3 — the reference corridor, end to end", () => {
  it("measures distance −0.924 abatement / +0.085 gap", () => {
    // The plan quoted −0.91 (the point derivative); the central difference
    // the plan defines measures −0.924 on the same corridor.
    expect(val(reference, "cargo.oneWayDistanceNm", "costPerTonneCo2Usd")).toBeCloseTo(-0.924, 2);
    expect(val(reference, "cargo.oneWayDistanceNm", "gapPvUsdM")).toBeCloseTo(0.085, 2);
  });
});

describe("the worked example §29 quotes is the measurement", () => {
  it("pins every number in the docs' reference-corridor elasticity table", () => {
    // §29's elasticity subsection prints these six rows. If a regeneration
    // or an engine change moves them, the docs' worked example lies — the
    // same contract sweepParams.test.ts holds over the endpoint dollars.
    const rows: [string, ElasticityKpi, number][] = [
      ["green.prodCapexUsdM", "gapPvUsdM", 0.33],
      ["green.prodCapexUsdM", "costPerTonneCo2Usd", 0.33],
      ["cargo.horizonYears", "gapPvUsdM", 0.24],
      ["cargo.horizonYears", "costPerTonneCo2Usd", -0.76],
      ["green.priceUsdPerTonne", "gapPvUsdM", 0.21],
      ["green.priceUsdPerTonne", "costPerTonneCo2Usd", 0.21],
      ["fossil.wtwGco2PerMj", "gapPvUsdM", -0.16],
      ["fossil.wtwGco2PerMj", "costPerTonneCo2Usd", -1.5],
      ["cargo.oneWayDistanceNm", "gapPvUsdM", 0.09],
      ["cargo.oneWayDistanceNm", "costPerTonneCo2Usd", -0.92],
      ["cargo.wacc", "gapPvUsdM", -0.18],
      ["cargo.wacc", "costPerTonneCo2Usd", -0.18],
    ];
    for (const [id, kpi, expected] of rows) {
      expect(val(reference, id, kpi), `${id} ${kpi}`).toBeCloseTo(expected, 2);
    }
  });
});

describe("acceptance 4 — the log-derivative identity ties the three tabs together", () => {
  // abatement = gap / tonnes, so E_abatement = E_gap − E_tonnes exactly in
  // the limit and to O(step²) across the finite step. Where the finite step
  // sees curvature the module FLAGS the row (`nonlinear`), and exactly those
  // rows carry a visibly larger identity residual — so the flag is the
  // tolerance boundary: 1e-2 unflagged, 5e-2 flagged. Every observed
  // violator (horizon's lumpy integer step, the fossil burn and fossil WtW
  // moving the tonnes denominator ~13% per nudge) is flagged.
  const identityHolds = (r: typeof user) => {
    for (const e of r.entries) {
      const err = Math.abs(
        e.perKpi.costPerTonneCo2Usd.value -
          (e.perKpi.gapPvUsdM.value - e.perKpi.co2AbatedTonnes.value),
      );
      const curved =
        e.perKpi.costPerTonneCo2Usd.nonlinear ||
        e.perKpi.gapPvUsdM.nonlinear ||
        e.perKpi.co2AbatedTonnes.nonlinear;
      expect(err, e.id).toBeLessThanOrEqual(curved ? 5e-2 : 1e-2);
    }
  };
  it("holds within 1e-2 (5e-2 where the nonlinearity flag is up) on the user corridor", () => {
    identityHolds(user);
  });

  it("holds on the reference corridor too", () => {
    identityHolds(reference);
  });
});

describe("acceptance 5 — coupling groups", () => {
  it("never ranks a solo member of a coupling group, on any tab or family", () => {
    for (const kpi of ELASTICITY_KPIS) {
      for (const kind of ["relative", "absolutePp"] as const) {
        for (const e of rankedEntries(user, kpi, kind)) {
          expect(DETAIL_ONLY.has(e.id), `${e.id} ranked on ${kpi}`).toBe(false);
        }
      }
    }
  });

  it("keeps the members in step with the sweep's coupling groups", () => {
    for (const g of LIVE_GROUPS) {
      const sweep = COUPLING_GROUPS.find((c) => c.id === g.id)!;
      expect([...g.members].sort()).toEqual([...sweep.members].sort());
    }
  });

  it("computes each member's solo value as detail on the group row", () => {
    const g = entry(user, "energy-demand")!;
    expect(g.group).toBe(true);
    for (const m of g.members!) {
      expect(entry(user, m), m).toBeDefined();
    }
  });
});

describe("acceptance 6 — exact zeros stay exactly 0.00", () => {
  it("measures throughput, unit weight and efficiency ratio as bit-exact zeros", () => {
    for (const id of ["cargo.unitsPerYear", "cargo.unitWeightTonnes", "green.efficiencyRatio"]) {
      expect(val(user, id, "gapPvUsdM"), id).toBe(0);
      expect(val(user, id, "costPerTonneCo2Usd"), id).toBe(0);
    }
  });

  it("keeps measured zeros in the ranking rather than dropping them", () => {
    const ranked = rankedEntries(user, "gapPvUsdM", "relative").map((e) => e.id);
    expect(ranked).toContain("cargo.unitsPerYear");
    expect(ranked).toContain("cargo.unitWeightTonnes");
  });

  it("shows the same throughput moving the per-unit cost — placement needs all six tabs", () => {
    // 0.00 on the gap is a finding about ONE output: throughput is the sole
    // driver of $/cargo unit (−1.01: more units, cheaper per unit).
    expect(val(user, "cargo.unitsPerYear", "costPerUnitUsd")).toBeCloseTo(-1.01, 2);
  });
});

describe("drift guard — the live table IS the offline harness, measured", () => {
  // The value paths and setters are duplicated from scripts/corridor (the app
  // must not bundle the scripts tree), so this recomputes the live numbers on
  // the three archetypes and compares them against the committed artifact.
  // Bit-equality is expected: both sides run the same engine on the same
  // nudges. A divergence means the two tables no longer agree.
  const art = JSON.parse(
    readFileSync(`${ROOT}data/corridor-sensitivity/elasticity.json`, "utf8"),
  ) as {
    rows: {
      id: string;
      scenarios: Record<
        string,
        { measurable: boolean; perKpi?: Record<string, { up: number; down: number }> }
      >;
    }[];
    groups: {
      id: string;
      scenarios: Record<
        string,
        { measurable: boolean; perKpi?: Record<string, { up: number; down: number }> }
      >;
    }[];
  };
  const excluded = new Set(LIVE_EXCLUDED.map((e) => e.id));

  for (const a of ARCHETYPES) {
    it(`matches every measured cell of archetype ${a.key} to 1e-9`, () => {
      const input = migrateScenarioInput(JSON.parse(JSON.stringify(a.build()))).input;
      const live = computeLiveElasticity(input, bundleCurrent)!;
      let checked = 0;
      for (const row of art.rows) {
        const cell = row.scenarios[a.key];
        if (!cell?.measurable || !cell.perKpi) continue;
        if (excluded.has(row.id)) continue; // deliberately not nudged live
        const e = entry(live, row.id);
        expect(e, `${a.key} ${row.id} missing from the live table`).toBeDefined();
        for (const kpi of ELASTICITY_KPIS) {
          const artCell = cell.perKpi[kpi]!;
          expect(e!.perKpi[kpi].up, `${row.id} ${kpi} up`).toBeCloseTo(artCell.up, 9);
          expect(e!.perKpi[kpi].down, `${row.id} ${kpi} down`).toBeCloseTo(artCell.down, 9);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(100); // anti-vacuity
    });

    it(`matches the ${a.key} group figures §38 publishes`, () => {
      const input = migrateScenarioInput(JSON.parse(JSON.stringify(a.build()))).input;
      const live = computeLiveElasticity(input, bundleCurrent)!;
      for (const g of LIVE_GROUPS) {
        const cell = art.groups.find((x) => x.id === g.id)!.scenarios[a.key];
        if (!cell?.measurable || !cell.perKpi) continue;
        const e = entry(live, g.id)!;
        for (const kpi of ELASTICITY_KPIS) {
          expect(e.perKpi[kpi].up, `${g.id} ${kpi} up`).toBeCloseTo(cell.perKpi[kpi]!.up, 9);
          expect(e.perKpi[kpi].down, `${g.id} ${kpi} down`).toBeCloseTo(cell.perKpi[kpi]!.down, 9);
        }
      }
    });
  }

  it("covers every numeric sweep param, or names the reason it does not", () => {
    // A new sweep param must show up in the panel or in the exclusion list —
    // never silently vanish from the live view.
    const covered = new Set([...LIVE_PARAMS.map((p) => p.id), ...LIVE_EXCLUDED.map((e) => e.id)]);
    for (const p of PARAMS) {
      if (p.options) continue; // choices are excluded by construction (R4)
      expect(covered.has(p.id), p.id).toBe(true);
    }
  });

  it("classifies every live param exactly as the sweep does", () => {
    for (const p of LIVE_PARAMS) {
      expect(p.kind, p.id).toBe(perturbationType(p.id));
    }
  });
});

describe("the panel cannot crash on a missing label", () => {
  it("has an i18n label for every live param, group and excluded id, and every reason", () => {
    // next-intl THROWS on a missing key from the root layout (see
    // tornado.test.ts on the shipped incident), so every id the panel can
    // ever render must carry a label under its slugified name.
    const messages = JSON.parse(
      readFileSync(`${ROOT}apps/web/messages/en/corridor.json`, "utf8"),
    ) as { corridor: { results: Record<string, Record<string, string>> } };
    const results = messages.corridor.results;
    const messageKey = (id: string) => id.replace(/\./g, "-");
    const ids = [
      ...LIVE_PARAMS.map((p) => p.id),
      ...LIVE_GROUPS.map((g) => g.id),
      ...LIVE_EXCLUDED.map((e) => e.id),
    ];
    for (const id of ids) {
      expect(results.elasticityRow?.[messageKey(id)], `elasticityRow.${messageKey(id)}`).toBeDefined();
    }
    for (const reason of ["absent", "zero", "error", "excluded"]) {
      expect(results.elasticityReason?.[reason], `elasticityReason.${reason}`).toBeDefined();
    }
    for (const k of ELASTICITY_KPIS) {
      expect(results.kpi?.[k], `kpi.${k}`).toBeDefined();
    }
  });
});

describe("cost — cheap enough to memoize on scenario change", () => {
  it("stays around two evaluations per measurable input", () => {
    // 51 live params + 3 groups, ×2 nudges, +1 base, minus the skipped ones.
    expect(user.evaluations).toBeLessThan(120);
    expect(user.evaluations).toBeGreaterThan(40);
  });
});
