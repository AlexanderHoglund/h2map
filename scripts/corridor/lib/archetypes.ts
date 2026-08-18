/**
 * The three corridor archetypes the impact measurements run across.
 *
 * WHY THREE. Elasticity is scenario-dependent, and a single baseline hides
 * that. Corridor length is the clearest case: it is a top driver on a
 * deep-sea corridor whose burns are DERIVED from geometry, and exactly zero
 * on a corridor whose burns are TYPED, because a typed burn makes consumption
 * constant and distance can then only reach the result through cost channels.
 * Measured on these three:
 *
 *     A Chile, burns derived   distance elasticity  -0.267
 *     C feeder, burns typed    distance elasticity   0.000
 *     C feeder, burns derived  distance elasticity  -0.084   (contrast only)
 *
 * The spread across archetypes is itself a reported quantity — a field that
 * matters everywhere and a field that matters on one route are different
 * facts, and one baseline cannot tell them apart.
 *
 * THESE ARE TEST FIXTURES, NOT SHIPPED PROJECTS. They are used by the
 * elasticity and uncertainty harnesses and their tests. They are deliberately
 * NOT seeded to users: B and C are archetype probes assembled to exercise the
 * model's cost structure, not published case studies like the four Chilean
 * examples, and presenting them beside those would imply a provenance they do
 * not have.
 *
 * PROVENANCE. A is the shipped default, itself a real published case. B and C
 * borrow their geometry from figures already validated in this repo (see each
 * builder). Where a number is an assumption rather than a source, the comment
 * says so — nothing here is presented as researched when it is not.
 */

import type { ScenarioInput } from "@h2map/corridor-schema";
import { defaultScenario } from "../../../apps/web/lib/corridor/scenarioDefaults";

export interface Archetype {
  key: "A" | "B" | "C";
  id: string;
  label: string;
  /** One line on what this archetype is for. */
  note: string;
  build: () => ScenarioInput;
}

/** Deep clone + the v6 posture the sweeps use (derived factors, WtW). */
function base(): Record<string, never> {
  return JSON.parse(JSON.stringify(defaultScenario())) as Record<string, never>;
}

/**
 * Release the emission factors so the v6 derivation drives them.
 *
 * `fuelTonnesPerVesselYear` is handled PER ARCHETYPE, never here: whether a
 * burn is typed or derived is the defining difference between B and C, so
 * making it a shared default would erase the contrast this file exists for.
 */
function releaseFactors(s: Record<string, never>): void {
  const o = s as unknown as Record<string, Record<string, unknown>>;
  for (const side of ["green", "fossil"] as const) {
    const cur = o[side]!;
    o[side] = {
      ...cur,
      overrides: {
        ...(cur.overrides as Record<string, unknown>),
        combustionEfTco2PerTonne: null,
        wtwGco2PerMj: null,
        lhvMjPerTonne: null,
      },
    };
  }
  o.regulation = { ...o.regulation, emissions: { framework: "fueleu" } };
  o.flags = { ...(o.flags ?? {}), emissionsBasis: "wellToWake" };
}

/**
 * A — Chilean copper concentrate. Build-dedicated, deep-sea, capital-heavy.
 *
 * The shipped default (MMMCZCS Sep 2025, Mejillones-Japan). Its burns are
 * RELEASED here: the shipped scenario types them from the study, and a typed
 * burn would make corridor length measure zero — the same trap the sensitivity
 * sweep documents in its own baseline.
 */
function buildA(): ScenarioInput {
  const s = base();
  releaseFactors(s);
  const o = s as unknown as Record<string, Record<string, unknown>>;
  for (const side of ["green", "fossil"] as const) {
    const cur = o[side]!;
    o[side] = {
      ...cur,
      overrides: { ...(cur.overrides as Record<string, unknown>), fuelTonnesPerVesselYear: null },
    };
  }
  return s as unknown as ScenarioInput;
}

/**
 * B — Australia-Korea iron ore. Buy-from-hub, deep-sea, fuel-price-dominated.
 *
 * Geometry: Newcastlemax on a 5,300 nm one-way run at 6 round trips a year.
 *
 * The HULL is the validated one — `bulk-newcastlemax-210k` carries the
 * GMF/RMI iron-ore rate (16,440 t NH3/vessel/yr over 6,166 nm x 6, giving
 * 4,133 MJ/nm), pinned by `studyValidation.test.ts`. The DISTANCE and the
 * route are this file's assumption: Port Hedland to Gwangyang is roughly
 * 5,300 nm, and no in-repo source states it, so it is an archetype parameter
 * rather than a researched figure. It is not tuned to reproduce anything.
 *
 * PURCHASE sourcing is the point: with no plant to build, the corridor's cost
 * is dominated by the delivered fuel price rather than by capital, which is
 * the axis A cannot exercise.
 */
function buildB(): ScenarioInput {
  const s = base();
  releaseFactors(s);
  const o = s as unknown as Record<string, Record<string, unknown>>;
  o.cargo = {
    ...o.cargo,
    oneWayDistanceNm: 5300,
    roundtripsPerYear: 6,
    vessels: 8,
    unit: "tonne",
    unitsPerYear: 8 * 6 * 210_000,
    startYear: 2030,
    horizonYears: 15,
  };
  o.vessel = { ...o.vessel, typeId: "bulk-newcastlemax-210k" };
  for (const side of ["green", "fossil"] as const) {
    const cur = o[side]!;
    o[side] = {
      ...cur,
      // Buy from a hub: no plant, so production capex/opex are zeroed by the
      // resolver and the merchant price carries the cost.
      sourcing: "purchase",
      overrides: { ...(cur.overrides as Record<string, unknown>), fuelTonnesPerVesselYear: null },
    };
  }
  (o.green as Record<string, unknown>).fuelId = "e-ammonia";
  (o.fossil as Record<string, unknown>).fuelId = "lsfo";
  // IMO Net-Zero rather than the EU schemes: an Australia-Korea run touches
  // no EEA port, so ETS and FuelEU are off by geography, not by preference.
  const regB = o.regulation!;
  o.regulation = {
    ...regB,
    ets: { enabled: false, euaEurPerTonne: 80, scope: 1 },
    fuelEu: { ...(regB.fuelEu as Record<string, unknown>), enabled: false },
    // Declared WHOLE, not spread over the default: the default scenario
    // carries no imoNetZero block at all, so spreading it produced
    // `{ enabled: true }` and the schema rejected the missing `scope`.
    imoNetZero: { enabled: true, scope: 1 },
  };
  return s as unknown as ScenarioInput;
}

/**
 * C — Skagerrak green box. Contract offtake, short-sea, EU regulation live.
 *
 * Gothenburg-Rotterdam, 562 nm, 2 x 1,800 TEU methanol dual-fuel feeders at
 * 60 round trips a year, 2029-2043. Same parameters as the Skagerrak fixture
 * in `etsCarbonOrigin.test.ts`, so the two agree.
 *
 * ITS BURNS ARE TYPED, and that is the archetype. A contract offtake states a
 * volume; the corridor then buys that volume whatever the routing does. The
 * figures below are the model's OWN derived burns at this geometry, frozen —
 * so C is A's cost structure with one bookkeeping difference, and the
 * elasticity contrast isolates exactly that difference rather than confounding
 * it with route length or fuel choice.
 */
function buildC(): ScenarioInput {
  const s = base();
  releaseFactors(s);
  const o = s as unknown as Record<string, Record<string, unknown>>;
  o.cargo = {
    ...o.cargo,
    oneWayDistanceNm: 562,
    roundtripsPerYear: 60,
    vessels: 2,
    unit: "teu",
    unitTonnes: 14,
    unitsPerYear: 2 * 1800 * 60,
    startYear: 2029,
    horizonYears: 15,
  };
  o.vessel = { ...o.vessel, typeId: "cont-feeder-1800" };
  (o.green as Record<string, unknown>).fuelId = "e-methanol";
  (o.fossil as Record<string, unknown>).fuelId = "lsfo";
  o.discounting = { ...o.discounting, wacc: 0.055 };
  (s as unknown as Record<string, unknown>).inflation = 0.02;
  o.regulation = {
    ...o.regulation,
    eurUsd: 1.08,
    ets: { enabled: true, euaEurPerTonne: 100, scope: 1 },
  };
  // Typed at the model's own derived values for this geometry — see
  // `archetypes.test.ts`, which recomputes them and fails if they drift.
  for (const [side, tonnes] of [
    ["green", TYPED_BURN_C.green],
    ["fossil", TYPED_BURN_C.fossil],
  ] as const) {
    const cur = o[side]!;
    o[side] = {
      ...cur,
      overrides: {
        ...(cur.overrides as Record<string, unknown>),
        fuelTonnesPerVesselYear: tonnes,
      },
    };
  }
  return s as unknown as ScenarioInput;
}

/**
 * C's frozen burns, t/vessel/yr.
 *
 * NOT hand-chosen: these are what the model derives for C's geometry with the
 * overrides released. Kept as literals so the scenario is a plain data
 * declaration rather than a two-pass construction, and pinned by a test that
 * re-derives them — if the vessel table or the LHVs move, the test fails and
 * says so rather than letting C quietly describe a different corridor.
 */
export const TYPED_BURN_C = {
  green: 11383.465326633166,
  fossil: 5593.357037037037,
} as const;

export const ARCHETYPES: readonly Archetype[] = [
  {
    key: "A",
    id: "chile-copper",
    label: "Chile copper concentrate (build, deep-sea)",
    note: "Capital-dominated; burns derived, so distance drives consumption.",
    build: buildA,
  },
  {
    key: "B",
    id: "australia-korea-iron",
    label: "Australia-Korea iron ore (purchase, deep-sea)",
    note: "Fuel-price-dominated; no plant; IMO Net-Zero rather than EU schemes.",
    build: buildB,
  },
  {
    key: "C",
    id: "skagerrak-green-box",
    label: "Skagerrak green box (contract offtake, short-sea)",
    note: "Burns TYPED, so distance is inert; EU ETS and FuelEU both live.",
    build: buildC,
  },
];
