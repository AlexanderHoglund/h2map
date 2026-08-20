/**
 * Live elasticity — "what moves it most", measured on the scenario in front
 * of you.
 *
 * Neither of the two existing views answers that question. The §29 endpoint
 * sweep multiplies the model by an ASSUMED RANGE, so a generous range buys a
 * high rank; the tornado multiplies it by researched uncertainty, which is a
 * different (also useful) question. This module gives every input the SAME
 * standard nudge and reports the signed response, so the ranking is a
 * property of the model at the user's own point and nothing else:
 *
 *   elasticity = (f(x·1.1) − f(x·0.9)) / f(x) / 0.2
 *
 * a signed central difference — "the % change in the output per 1% change in
 * the input". −0.34 means the output FALLS 0.34% when the input rises 1%.
 *
 * TWO FAMILIES, never one ordering. Rates and fractions move in PERCENTAGE
 * POINTS (±1pp), because ±10% of a 5.5% WACC is 6.05% and nobody reasons
 * about rate uncertainty that way. The pp elasticity is normalised by the
 * relative size of the ±1pp step (the same convention as the offline
 * harness, so §38's leverage numbers are the same quantity), which makes the
 * number dimensionless but NOT comparable with the ±10% family — a ±1pp move
 * on a 3% rate is a 33% relative move. The UI must keep the families apart.
 *
 * COUPLING (R5): inputs whose solo move is unphysical are nudged together.
 * Moving one side's burn alone drives `energyParity.diverged` true — a state
 * the model itself rejects — and a one-sided newbuild-price move measures a
 * spread change, not a market shock (see `tornado.ts` on the same point).
 * The group figure is the ranked one; the members' solo figures are computed
 * as explanatory detail and are never ranked (`detailOnly`).
 *
 * Choices are excluded by construction (R4): a categorical has no
 * proportional nudge — their impact is the sweep's `discreteImpact`.
 *
 * The per-field value paths and setters MIRROR `scripts/corridor/lib/params.ts`
 * and the offline harness's value-path table. They are duplicated rather than
 * imported because the app must not bundle the scripts tree; the drift test
 * (`scripts/lib/elasticityLive.test.ts`) recomputes this module's numbers on
 * the three archetypes and compares them against the committed
 * `elasticity.json`, so a divergence between the two tables fails loudly.
 *
 * Pure: no React, no I/O.
 */

import {
  resolveScenario,
  type RefBundle,
  type ResolvedScenario,
  type ScenarioInput,
} from "@h2map/corridor-schema";
import { evaluateScenario } from "@h2map/corridor-engine";

/** The outputs the panel can rank by — the model's six headline KPIs. */
export const ELASTICITY_KPIS = [
  "gapPvUsdM",
  "costPerUnitUsd",
  "costPerTonneCo2Usd",
  "greenTotalPvUsdM",
  "fossilTotalPvUsdM",
  "co2AbatedTonnes",
] as const;
export type ElasticityKpi = (typeof ELASTICITY_KPIS)[number];

/** ±10% for ordinary quantities — the same step as the offline harness. */
export const RELATIVE_STEP = 0.1;
/** ±1 percentage point for rates and fractions. */
export const ABSOLUTE_PP_STEP = 0.01;
/**
 * Up- and down-nudge disagreeing by more than this (relative to their mean)
 * marks CURVATURE at this point — a single number cannot carry it, so the
 * row is flagged rather than silently averaged.
 */
export const NONLINEAR_FLAG = 0.2;

export type LiveKind = "relative" | "absolutePp";

interface LiveParam {
  /** The sweep id — the join to §38, the i18n labels and the groups. */
  id: string;
  kind: LiveKind;
  /** Dot-path where the value lives on the scenario (and is written back). */
  path: string;
  /**
   * Where the RESOLVED value lives when the scenario slot is null. An unset
   * override means "use the model's own figure", and nudging that figure is
   * what the field means: "if the fuel really costs 10% more than the model
   * derives, what happens?".
   */
  fallback?: (r: ResolvedScenario) => number | null | undefined;
  /** Integer fields round after the nudge — mirrors the sweep's setters. */
  round?: boolean;
  /**
   * Custom write for fields whose parent object may not exist yet (the
   * per-side `emissions` block). Read still goes through `path`.
   */
  write?: (s: ScenarioInput, v: number) => void;
}

const setPath = (s: ScenarioInput, path: string, value: number): void => {
  const keys = path.split(".");
  let node = s as unknown as Record<string, unknown>;
  for (const k of keys.slice(0, -1)) {
    const next = node[k];
    if (next === null || typeof next !== "object") return;
    node = next as Record<string, unknown>;
  }
  node[keys[keys.length - 1]!] = value;
};

const readPath = (s: ScenarioInput, path: string): number | null => {
  let node: unknown = s;
  for (const k of path.split(".")) {
    if (node === null || typeof node !== "object") return null;
    node = (node as Record<string, unknown>)[k];
  }
  return typeof node === "number" ? node : null;
};

/** The empty per-side emissions block — every slot explicit, like the sweep. */
const EMISSIONS_NULLS = {
  certifiedWttGco2ePerMj: null,
  n2oScenarioId: null,
  pilotShare: null,
  pilotFuelId: null,
  engineType: null,
  sulphurPercent: null,
  efficiencyRatio: null,
} as const;

const writeEmissions =
  (side: "green" | "fossil", field: keyof typeof EMISSIONS_NULLS) =>
  (s: ScenarioInput, v: number): void => {
    const cur = s[side].emissions ?? {};
    s[side].emissions = {
      ...EMISSIONS_NULLS,
      ...cur,
      [field]: v,
    } as ScenarioInput["green"]["emissions"];
  };

/**
 * Every numeric input the panel nudges. Ids and value paths mirror
 * `scripts/corridor/lib/params.ts` + the offline harness; the drift test
 * pins the correspondence against the committed artifact.
 */
export const LIVE_PARAMS: readonly LiveParam[] = [
  // ---- geometry & cargo -------------------------------------------------
  { id: "cargo.oneWayDistanceNm", kind: "relative", path: "cargo.oneWayDistanceNm" },
  { id: "cargo.horizonYears", kind: "relative", path: "cargo.horizonYears", round: true },
  { id: "cargo.unitsPerYear", kind: "relative", path: "cargo.unitsPerYear" },
  { id: "cargo.vessels", kind: "relative", path: "cargo.vessels", round: true },
  { id: "cargo.roundtripsPerYear", kind: "relative", path: "cargo.roundtripsPerYear", round: true },
  { id: "cargo.unitWeightTonnes", kind: "relative", path: "cargo.unitWeightTonnes" },
  // ---- fleet ------------------------------------------------------------
  {
    id: "vessel.green.capexUsdM",
    kind: "relative",
    path: "vessel.green.capexUsdMPerShip",
    fallback: (r) => r.green.vesselCapexUsdMPerShip.value,
  },
  {
    id: "vessel.green.opexUsdMPerYear",
    kind: "relative",
    path: "vessel.green.opexUsdMPerShipPerYear",
    fallback: (r) => r.green.vesselOpexUsdMPerShipPerYear.value,
  },
  {
    id: "vessel.fossil.capexUsdM",
    kind: "relative",
    path: "vessel.fossil.capexUsdMPerShip",
    fallback: (r) => r.fossil.vesselCapexUsdMPerShip.value,
  },
  {
    id: "vessel.fossil.opexUsdMPerYear",
    kind: "relative",
    path: "vessel.fossil.opexUsdMPerShipPerYear",
    fallback: (r) => r.fossil.vesselOpexUsdMPerShipPerYear.value,
  },
  // ---- fuel (green) -----------------------------------------------------
  {
    id: "green.priceUsdPerTonne",
    kind: "relative",
    path: "green.overrides.priceUsdPerTonne",
    fallback: (r) => r.green.priceUsdPerTonne.value,
  },
  {
    id: "green.fuelTonnesPerVesselYear",
    kind: "relative",
    path: "green.overrides.fuelTonnesPerVesselYear",
    fallback: (r) => r.green.tonnesPerVesselYear.value,
  },
  {
    id: "green.prodCapexUsdM",
    kind: "relative",
    path: "green.overrides.prodCapexUsdM",
    fallback: (r) => r.green.prodCapexUsdM.value,
  },
  {
    id: "green.prodOpexUsdMPerYear",
    kind: "relative",
    path: "green.overrides.prodOpexUsdMPerYear",
    fallback: (r) => r.green.prodOpexUsdMPerYear.value,
  },
  {
    id: "green.wtwGco2PerMj",
    kind: "relative",
    path: "green.overrides.wtwGco2PerMj",
    fallback: (r) => r.green.wtw.value,
  },
  {
    id: "green.combustionEf",
    kind: "relative",
    path: "green.overrides.combustionEfTco2PerTonne",
    fallback: (r) => r.green.combustionEf.value,
  },
  {
    id: "green.lhvMjPerTonne",
    kind: "relative",
    path: "green.overrides.lhvMjPerTonne",
    fallback: (r) => r.green.lhv.value,
  },
  {
    id: "green.certifiedWttGco2ePerMj",
    kind: "relative",
    path: "green.emissions.certifiedWttGco2ePerMj",
    write: writeEmissions("green", "certifiedWttGco2ePerMj"),
  },
  {
    id: "green.efficiencyRatio",
    kind: "relative",
    path: "green.emissions.efficiencyRatio",
    // The model's default ratio is 1 (green engine as efficient as fossil);
    // an unset field means exactly that, so the nudge starts there.
    fallback: () => 1,
    write: writeEmissions("green", "efficiencyRatio"),
  },
  {
    id: "green.pilotShare",
    kind: "absolutePp",
    path: "green.emissions.pilotShare",
    write: writeEmissions("green", "pilotShare"),
  },
  // ---- fuel (fossil) ----------------------------------------------------
  {
    id: "fossil.priceUsdPerTonne",
    kind: "relative",
    path: "fossil.overrides.priceUsdPerTonne",
    fallback: (r) => r.fossil.priceUsdPerTonne.value,
  },
  {
    id: "fossil.fuelTonnesPerVesselYear",
    kind: "relative",
    path: "fossil.overrides.fuelTonnesPerVesselYear",
    fallback: (r) => r.fossil.tonnesPerVesselYear.value,
  },
  {
    id: "fossil.wtwGco2PerMj",
    kind: "relative",
    path: "fossil.overrides.wtwGco2PerMj",
    fallback: (r) => r.fossil.wtw.value,
  },
  {
    id: "fossil.combustionEf",
    kind: "relative",
    path: "fossil.overrides.combustionEfTco2PerTonne",
    fallback: (r) => r.fossil.combustionEf.value,
  },
  {
    id: "fossil.lhvMjPerTonne",
    kind: "relative",
    path: "fossil.overrides.lhvMjPerTonne",
    fallback: (r) => r.fossil.lhv.value,
  },
  {
    id: "fossil.sulphurPercent",
    kind: "relative",
    path: "fossil.emissions.sulphurPercent",
    // No fallback and no framework flip: the field only exists under IMO
    // accounting, and the live panel measures the scenario AS IT STANDS.
    write: writeEmissions("fossil", "sulphurPercent"),
  },
  // ---- ports ------------------------------------------------------------
  {
    id: "port.storageCapexUsdM",
    kind: "relative",
    path: "green.overrides.portStorageCapexUsdM",
    fallback: (r) => r.green.portStorageCapexUsdM.value,
  },
  {
    id: "port.storageOpexUsdMPerYear",
    kind: "relative",
    path: "green.overrides.portStorageOpexUsdMPerYear",
    fallback: (r) => r.green.portStorageOpexUsdMPerYear.value,
  },
  {
    id: "port.bargeCapexUsdM",
    kind: "relative",
    path: "green.overrides.bargeCapexUsdM",
    fallback: (r) => r.green.bargeCapexUsdM.value,
  },
  {
    id: "port.bargeOpexUsdMPerYear",
    kind: "relative",
    path: "green.overrides.bargeOpexUsdMPerYear",
    fallback: (r) => r.green.bargeOpexUsdMPerYear.value,
  },
  {
    id: "port.fossilStorageCapexUsdM",
    kind: "relative",
    path: "fossil.overrides.portStorageCapexUsdM",
    fallback: (r) => r.fossil.portStorageCapexUsdM.value,
  },
  {
    id: "port.fossilStorageOpexUsdMPerYear",
    kind: "relative",
    path: "fossil.overrides.portStorageOpexUsdMPerYear",
    fallback: (r) => r.fossil.portStorageOpexUsdMPerYear.value,
  },
  {
    id: "port.fossilBargeCapexUsdM",
    kind: "relative",
    path: "fossil.overrides.bargeCapexUsdM",
    fallback: (r) => r.fossil.bargeCapexUsdM.value,
  },
  {
    id: "port.fossilBargeOpexUsdMPerYear",
    kind: "relative",
    path: "fossil.overrides.bargeOpexUsdMPerYear",
    fallback: (r) => r.fossil.bargeOpexUsdMPerYear.value,
  },
  // ---- financing & discounting -----------------------------------------
  {
    id: "cargo.wacc",
    kind: "absolutePp",
    path: "cargo.waccOverride",
    fallback: (r) => r.wacc.value,
  },
  { id: "cargo.inflation", kind: "absolutePp", path: "cargo.inflation" },
  // Financing sub-fields nudge IN PLACE, only when the module is on — the
  // sweep's setters force a reference structure instead, which on a live
  // scenario would overwrite the user's own financing. The module-off case
  // is reported as not measurable, exactly like the offline harness.
  { id: "financing.greenRate", kind: "absolutePp", path: "financing.greenRate" },
  { id: "financing.baseRate", kind: "absolutePp", path: "financing.baseRate" },
  { id: "financing.debtShare", kind: "absolutePp", path: "financing.debtShare" },
  { id: "financing.tenorYears", kind: "relative", path: "financing.tenorYears", round: true },
  // ---- regulation -------------------------------------------------------
  { id: "regulation.euaEurPerTonne", kind: "relative", path: "regulation.ets.euaEurPerTonne" },
  { id: "regulation.etsScope", kind: "absolutePp", path: "regulation.ets.scope" },
  { id: "regulation.euaEscalation", kind: "absolutePp", path: "regulation.ets.euaEscalation" },
  { id: "regulation.eurUsd", kind: "relative", path: "regulation.eurUsd" },
  { id: "regulation.fuelEuPenalty", kind: "relative", path: "regulation.fuelEu.penaltyEurPerTonne" },
  { id: "regulation.fuelEuScope", kind: "absolutePp", path: "regulation.fuelEu.scope" },
  {
    id: "regulation.fuelEuBaselineGco2PerMj",
    kind: "relative",
    path: "regulation.fuelEu.baselineGco2PerMj",
  },
  {
    id: "regulation.selfCo2PriceUsdPerTonne",
    kind: "relative",
    path: "regulation.selfDesigned.co2PriceUsdPerTonne",
  },
  {
    id: "regulation.selfSupportUsdPerKg",
    kind: "relative",
    path: "regulation.selfDesigned.supportUsdPerKg",
  },
  { id: "regulation.selfOtherUsdM", kind: "relative", path: "regulation.selfDesigned.otherUsdM" },
  {
    id: "regulation.selfCapexSupport",
    kind: "absolutePp",
    path: "regulation.selfDesigned.capexSupport",
  },
  {
    id: "regulation.selfOpexSupport",
    kind: "absolutePp",
    path: "regulation.selfDesigned.opexSupport",
  },
  {
    id: "regulation.selfCo2PriceEscalation",
    kind: "absolutePp",
    path: "regulation.selfDesigned.co2PriceEscalation",
  },
  { id: "regulation.imoScope", kind: "absolutePp", path: "regulation.imoNetZero.scope" },
  {
    id: "regulation.imoPriceEscalation",
    kind: "absolutePp",
    path: "regulation.imoNetZero.priceEscalation",
  },
];

/**
 * Sweep params the live panel deliberately does NOT nudge, with the reason.
 * Reported rather than dropped — a missing row must never read as "this does
 * not matter here" (the tornado's lesson, kept).
 */
export const LIVE_EXCLUDED: readonly { id: string; reason: string }[] = [
  {
    id: "cargo.startYear",
    reason: "calendar anchor — ±10% of a year number is not a perturbation",
  },
  {
    id: "capitalPhasing.years",
    reason: "composite setter (deployment profile) — no single value to nudge",
  },
  {
    id: "regulation.fuelEuVlsfoMjPerTonne",
    reason: "no per-unit elasticity in the offline harness either — kept aligned",
  },
  {
    id: "regulation.fuelEuCreditSurplusValue",
    reason: "module-enabling setter — nudging it would switch the credit on",
  },
  {
    id: "regulation.ira45zCreditUsdPerGallon",
    reason: "module-enabling setter — nudging it would switch 45Z on",
  },
  {
    id: "regulation.imoRewardUsdPerTonneCo2e",
    reason: "module-enabling setter — nudging it would parameterise the reward",
  },
];

/**
 * Coupling groups the panel ranks as ONE row. Definitions come from the
 * sweep's `COUPLING_GROUPS` (the same members, so the group figure matches
 * §38's archetype figures); `detailOnly` members are the ones whose SOLO
 * move is unphysical — they render indented under the group and never rank.
 * Distance and roundtrips stay solo-ranked: moving them alone is physical
 * (derived burns follow on both sides together).
 */
export interface LiveGroup {
  id: string;
  members: readonly string[];
  detailOnly: readonly string[];
}

export const LIVE_GROUPS: readonly LiveGroup[] = [
  {
    id: "energy-demand",
    members: [
      "cargo.oneWayDistanceNm",
      "cargo.roundtripsPerYear",
      "green.fuelTonnesPerVesselYear",
      "fossil.fuelTonnesPerVesselYear",
    ],
    detailOnly: ["green.fuelTonnesPerVesselYear", "fossil.fuelTonnesPerVesselYear"],
  },
  {
    id: "fleet-capital",
    members: ["vessel.green.capexUsdM", "vessel.fossil.capexUsdM"],
    detailOnly: ["vessel.green.capexUsdM", "vessel.fossil.capexUsdM"],
  },
  {
    id: "vessel-opex",
    members: ["vessel.green.opexUsdMPerYear", "vessel.fossil.opexUsdMPerYear"],
    detailOnly: ["vessel.green.opexUsdMPerYear", "vessel.fossil.opexUsdMPerYear"],
  },
];

/** Ids whose solo row is explanatory detail, never ranked (R5). */
export const DETAIL_ONLY: ReadonlySet<string> = new Set(
  LIVE_GROUPS.flatMap((g) => g.detailOnly),
);

export interface LiveElasticityValue {
  /** Signed central difference — the number the panel displays. */
  value: number;
  /** One-sided estimates, for the curvature flag and the tooltip. */
  up: number;
  down: number;
  /** Up and down disagree by >20% — the model is curved here. */
  nonlinear: boolean;
}

export interface LiveElasticityEntry {
  id: string;
  kind: LiveKind;
  /** True for a coupling-group row. */
  group: boolean;
  /** Group rows: the member ids rendered as indented detail. */
  members?: string[];
  /** Solo rows that belong to a group and must never rank. */
  detailOnly: boolean;
  /**
   * Relative size of ONE nudge — 0.1 for the ±10% family, step/value for the
   * ±1pp family. `value × fraction` is the fractional move of the output
   * under one nudge ("the effect of +10%" / "of +1pp"): the number a person
   * can read, which is what the docs' lead table prints.
   */
  fraction: number;
  perKpi: Record<ElasticityKpi, LiveElasticityValue>;
}

export interface LiveElasticityResult {
  base: Record<ElasticityKpi, number>;
  entries: LiveElasticityEntry[];
  /** Params that could not be nudged on THIS scenario, with the reason. */
  skipped: { id: string; reason: "absent" | "zero" | "error" }[];
  /** Sweep params excluded by design (see LIVE_EXCLUDED). */
  excluded: readonly { id: string; reason: string }[];
  /** Engine evaluations performed — the memoization cost, made visible. */
  evaluations: number;
}

type KpiVector = Record<ElasticityKpi, number>;

interface Nudge {
  /** Relative size of the applied nudge — the elasticity denominator. */
  fraction: number;
  apply: (s: ScenarioInput) => void;
}

function applyValue(p: LiveParam, s: ScenarioInput, v: number): void {
  const value = p.round ? Math.round(v) : v;
  if (p.write) p.write(s, value);
  else setPath(s, p.path, value);
}

/** Build the up/down nudges for one param, or say why there are none. */
function nudgesFor(
  p: LiveParam,
  scenario: ScenarioInput,
  resolved: ResolvedScenario,
): { up: Nudge; down: Nudge } | { reason: "absent" | "zero" } {
  let v = readPath(scenario, p.path);
  if (v === null && p.fallback) {
    const f = p.fallback(resolved);
    v = typeof f === "number" && Number.isFinite(f) ? f : null;
  }
  if (v === null || !Number.isFinite(v)) return { reason: "absent" };
  if (v === 0) return { reason: "zero" }; // a proportional nudge of 0 is 0
  if (p.kind === "absolutePp") {
    const step = ABSOLUTE_PP_STEP;
    return {
      up: { fraction: step / v, apply: (s) => applyValue(p, s, v + step) },
      down: { fraction: step / v, apply: (s) => applyValue(p, s, v - step) },
    };
  }
  return {
    up: { fraction: RELATIVE_STEP, apply: (s) => applyValue(p, s, v * (1 + RELATIVE_STEP)) },
    down: { fraction: RELATIVE_STEP, apply: (s) => applyValue(p, s, v * (1 - RELATIVE_STEP)) },
  };
}

/** (ΔKPI / KPI_base) / fraction per KPI — 0 where the base itself is 0. */
function elasticityOf(base: KpiVector, moved: KpiVector, fraction: number): KpiVector {
  const out = {} as KpiVector;
  for (const id of ELASTICITY_KPIS) {
    const b = base[id];
    out[id] = b === 0 || fraction === 0 ? 0 : (moved[id] - b) / b / fraction;
  }
  return out;
}

function toEntryValues(up: KpiVector, down: KpiVector): Record<ElasticityKpi, LiveElasticityValue> {
  const perKpi = {} as Record<ElasticityKpi, LiveElasticityValue>;
  for (const id of ELASTICITY_KPIS) {
    const u = up[id];
    const d = down[id];
    const magnitude = (Math.abs(u) + Math.abs(d)) / 2;
    perKpi[id] = {
      // The signed central difference is the mean of the two signed
      // one-sided estimates — sign preserved (R2/R3).
      value: (u + d) / 2,
      up: u,
      down: d,
      nonlinear:
        magnitude > 0 && Math.abs(Math.abs(u) - Math.abs(d)) / magnitude > NONLINEAR_FLAG,
    };
  }
  return perKpi;
}

/**
 * Measure every input's signed elasticity on ONE scenario.
 *
 * Roughly 2 engine evaluations per measurable input (~90 total on a typical
 * scenario, microseconds each) — cheap enough to memoize on scenario change.
 * Returns null when the scenario does not resolve at all.
 */
export function computeLiveElasticity(
  scenario: ScenarioInput,
  bundle: RefBundle,
): LiveElasticityResult | null {
  let resolved: ResolvedScenario;
  let evaluations = 0;

  const evaluate = (edit?: (s: ScenarioInput) => void): KpiVector | null => {
    try {
      const copy = JSON.parse(JSON.stringify(scenario)) as ScenarioInput;
      edit?.(copy);
      const summary = evaluateScenario(resolveScenario(copy, bundle)).summary;
      evaluations++;
      const out = {} as KpiVector;
      for (const id of ELASTICITY_KPIS) out[id] = summary[id];
      return out;
    } catch {
      return null;
    }
  };

  try {
    resolved = resolveScenario(scenario, bundle);
  } catch {
    return null;
  }
  const base = evaluate();
  if (!base) return null;

  const entries: LiveElasticityEntry[] = [];
  const skipped: { id: string; reason: "absent" | "zero" | "error" }[] = [];

  const nudgeCache = new Map<string, { up: Nudge; down: Nudge }>();
  for (const p of LIVE_PARAMS) {
    const n = nudgesFor(p, scenario, resolved);
    if ("reason" in n) {
      skipped.push({ id: p.id, reason: n.reason });
      continue;
    }
    nudgeCache.set(p.id, n);
    const up = evaluate(n.up.apply);
    const down = evaluate(n.down.apply);
    if (!up || !down) {
      skipped.push({ id: p.id, reason: "error" });
      nudgeCache.delete(p.id);
      continue;
    }
    entries.push({
      id: p.id,
      kind: p.kind,
      group: false,
      detailOnly: DETAIL_ONLY.has(p.id),
      fraction: n.up.fraction,
      perKpi: toEntryValues(
        elasticityOf(base, up, n.up.fraction),
        elasticityOf(base, down, -n.down.fraction),
      ),
    });
  }

  // Group rows: every measurable member moved TOGETHER by one common
  // relative step — that is what makes it a coupled move rather than a sum
  // of separate ones. Mirrors the offline harness's group machinery exactly.
  for (const g of LIVE_GROUPS) {
    const memberNudges = g.members
      .map((id) => nudgeCache.get(id))
      .filter((n): n is { up: Nudge; down: Nudge } => n !== undefined);
    if (memberNudges.length === 0) continue; // nothing measurable — no row
    const applyAll = (dir: 1 | -1) => (s: ScenarioInput) => {
      for (const n of memberNudges) (dir === 1 ? n.up : n.down).apply(s);
    };
    const up = evaluate(applyAll(1));
    const down = evaluate(applyAll(-1));
    if (!up || !down) continue;
    entries.push({
      id: g.id,
      kind: "relative",
      group: true,
      members: [...g.members],
      detailOnly: false,
      fraction: RELATIVE_STEP,
      perKpi: toEntryValues(
        elasticityOf(base, up, RELATIVE_STEP),
        elasticityOf(base, down, -RELATIVE_STEP),
      ),
    });
  }

  return { base, entries, skipped, excluded: LIVE_EXCLUDED, evaluations };
}

/**
 * The rows a ranking may contain: solo rows that are not group detail, plus
 * the group rows themselves — sorted by |elasticity| on one KPI, within one
 * family. The two families must never share one ordering (R2).
 */
export function rankedEntries(
  result: LiveElasticityResult,
  kpi: ElasticityKpi,
  kind: LiveKind,
): LiveElasticityEntry[] {
  // Measured zeros stay IN the list (at the bottom): "we measured it and it
  // does not move this output" is a finding, not a gap in coverage.
  return result.entries
    .filter((e) => !e.detailOnly && e.kind === kind)
    .sort((a, b) => Math.abs(b.perKpi[kpi].value) - Math.abs(a.perKpi[kpi].value));
}
