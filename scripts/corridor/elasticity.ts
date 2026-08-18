/**
 * Elasticity harness — LEVERAGE, the computed half of impact.
 *
 *   npx tsx scripts/corridor/elasticity.ts          # regenerate
 *
 * Writes data/corridor-sensitivity/elasticity.json.
 *
 * WHY THIS EXISTS BESIDE THE SWEEP. `sensitivity.ts` answers "how far can the
 * gap move if this field is pushed across its plausible range." That places UI
 * fields well and it stays authoritative for placement. As an IMPACT ranking
 * it has three faults, all of which reproduce against the committed artifact:
 *
 *   - Range arbitrariness. `regulation.selfOtherUsdM` ranks #1 at 376.4%
 *     because its range is $0-50m. That is a range choice, not a property of
 *     the model; two fields with identical influence score differently if
 *     their assumed ranges differ.
 *   - Coupled inputs double-count. Green and fossil consumption score 21.0%
 *     and 41.1% independently, while on any real corridor they are
 *     energy-matched.
 *   - One-at-a-time sees no interactions (only the Monte Carlo can).
 *
 * Elasticity removes the first fault by construction: a small standard nudge,
 * normalised, so the answer is a property of the model at that point rather
 * than of an assumed range. Groups remove the second. The third is out of
 * scope here and named in the artifact.
 *
 * ELASTICITY IS SCENARIO-DEPENDENT, which is why every figure is reported per
 * archetype and the SPREAD is part of the output. Corridor length measures
 * -0.267 on Chile and exactly 0 on a corridor whose burns are typed.
 *
 * The engine is untouched: this only evaluates it.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { parseRefBundle, type ScenarioInput } from "@h2map/corridor-schema";
import { evaluateScenario } from "@h2map/corridor-engine";
import { resolveScenario, migrateScenarioInput } from "@h2map/corridor-schema";
import {
  COUPLING_GROUPS,
  KPIS,
  PARAMS,
  groupsFor,
  kpisFor,
  perturbationType,
  type KpiId,
  type KpiVector,
  type Param,
} from "./lib/params";
import { ARCHETYPES } from "./lib/archetypes";

const ROOT = new URL("../../", import.meta.url);
const OUT_DIR = new URL("data/corridor-sensitivity/", ROOT);
const OUT_PATH = new URL("elasticity.json", OUT_DIR);

const bundle = parseRefBundle(
  JSON.parse(readFileSync(new URL("data/corridor-ref/2026-08-18-fuel-v4.json", ROOT), "utf8")),
);

/** ±10% for ordinary quantities. */
const RELATIVE_STEP = 0.1;
/** ±1 percentage point for rates and fractions. */
const ABSOLUTE_PP_STEP = 0.01;
/** Report an asymmetry flag past this — a curvature marker, not an error. */
const ASYMMETRY_FLAG = 0.2;

/** The value a param currently holds on a scenario, read via its own setter. */
function currentValue(
  p: Param,
  input: ScenarioInput,
  resolvedInput?: ReturnType<typeof resolveScenario>,
): number | null {
  // The `Param` setters write but nothing reads, and a relative nudge needs
  // the CURRENT value. The paths are declared below rather than derived from
  // the id, because several setters write elsewhere than their id suggests.
  const path = PARAM_VALUE_PATH[p.id];
  if (!path) return null;
  let node: unknown = input;
  for (const key of path.split(".")) {
    if (node === null || typeof node !== "object") return null;
    node = (node as Record<string, unknown>)[key];
  }
  if (typeof node === "number") return node;
  // Override slot unset: perturb the value the model actually resolved.
  const fallback = RESOLVED_FALLBACK[p.id];
  if (fallback && resolvedInput) {
    const v = fallback(resolvedInput);
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  return null;
}

/**
 * Where each sweep param's value LIVES, so a perturbation can be relative to
 * it. Declared rather than inferred: several setters write a different path
 * than their id (`cargo.wacc` writes `cargo.waccOverride`), and one writes a
 * whole object (`capitalPhasing.years`).
 *
 * A param absent here is reported `unperturbable` in the artifact with its
 * reason — never silently skipped and never guessed at.
 */
const PARAM_VALUE_PATH: Record<string, string> = {
  "cargo.oneWayDistanceNm": "cargo.oneWayDistanceNm",
  "cargo.horizonYears": "cargo.horizonYears",
  "cargo.unitsPerYear": "cargo.unitsPerYear",
  "cargo.wacc": "cargo.waccOverride",
  "cargo.inflation": "cargo.inflation",
  "cargo.vessels": "cargo.vessels",
  "cargo.roundtripsPerYear": "cargo.roundtripsPerYear",
  "vessel.green.capexUsdM": "vessel.green.capexUsdMPerShip",
  "vessel.green.opexUsdMPerYear": "vessel.green.opexUsdMPerShipPerYear",
  "vessel.fossil.capexUsdM": "vessel.fossil.capexUsdMPerShip",
  "vessel.fossil.opexUsdMPerYear": "vessel.fossil.opexUsdMPerShipPerYear",
  "green.priceUsdPerTonne": "green.overrides.priceUsdPerTonne",
  "green.fuelTonnesPerVesselYear": "green.overrides.fuelTonnesPerVesselYear",
  "green.prodCapexUsdM": "green.overrides.prodCapexUsdM",
  "green.prodOpexUsdMPerYear": "green.overrides.prodOpexUsdMPerYear",
  "green.wtwGco2PerMj": "green.overrides.wtwGco2PerMj",
  "green.combustionEf": "green.overrides.combustionEfTco2PerTonne",
  "green.lhvMjPerTonne": "green.overrides.lhvMjPerTonne",
  "fossil.priceUsdPerTonne": "fossil.overrides.priceUsdPerTonne",
  "fossil.fuelTonnesPerVesselYear": "fossil.overrides.fuelTonnesPerVesselYear",
  "fossil.wtwGco2PerMj": "fossil.overrides.wtwGco2PerMj",
  "fossil.combustionEf": "fossil.overrides.combustionEfTco2PerTonne",
  "fossil.lhvMjPerTonne": "fossil.overrides.lhvMjPerTonne",
  "regulation.euaEurPerTonne": "regulation.ets.euaEurPerTonne",
  "regulation.etsScope": "regulation.ets.scope",
  "regulation.euaEscalation": "regulation.ets.euaEscalation",
  "regulation.eurUsd": "regulation.eurUsd",
  "regulation.fuelEuPenalty": "regulation.fuelEu.penaltyEurPerTonne",
  "regulation.fuelEuScope": "regulation.fuelEu.scope",
  "regulation.fuelEuBaselineGco2PerMj": "regulation.fuelEu.baselineGco2PerMj",
  "green.pilotShare": "green.emissions.pilotShare",
  "green.efficiencyRatio": "green.emissions.efficiencyRatio",
  "green.certifiedWttGco2ePerMj": "green.emissions.certifiedWttGco2ePerMj",
  "port.storageCapexUsdM": "port.green.storageCapexUsdM",
  "port.storageOpexUsdMPerYear": "port.green.storageOpexUsdMPerYear",
  "port.bargeCapexUsdM": "port.green.bargeCapexUsdM",
  "port.bargeOpexUsdMPerYear": "port.green.bargeOpexUsdMPerYear",
  "port.fossilStorageCapexUsdM": "port.fossil.storageCapexUsdM",
  "port.fossilStorageOpexUsdMPerYear": "port.fossil.storageOpexUsdMPerYear",
  "port.fossilBargeCapexUsdM": "port.fossil.bargeCapexUsdM",
  "port.fossilBargeOpexUsdMPerYear": "port.fossil.bargeOpexUsdMPerYear",
  "financing.greenRate": "financing.greenRate",
  "financing.baseRate": "financing.baseRate",
  "financing.debtShare": "financing.debtShare",
  "financing.tenorYears": "financing.tenorYears",
  "regulation.selfCo2PriceUsdPerTonne": "regulation.selfDesigned.co2PriceUsdPerTonne",
  "regulation.selfSupportUsdPerKg": "regulation.selfDesigned.supportUsdPerKg",
  "regulation.selfCapexSupport": "regulation.selfDesigned.capexSupport",
  "regulation.selfOpexSupport": "regulation.selfDesigned.opexSupport",
  "regulation.selfOtherUsdM": "regulation.selfDesigned.otherUsdM",
  "regulation.selfCo2PriceEscalation": "regulation.selfDesigned.co2PriceEscalation",
  "regulation.ira45zRate": "regulation.ira45z.rateUsdPerGallon",
  "regulation.imoScope": "regulation.imoNetZero.scope",
  "regulation.imoPriceEscalation": "regulation.imoNetZero.priceEscalation",
  "regulation.imoReward": "regulation.imoNetZero.rewardUsdPerTonneCo2e",
  "regulation.fuelEuSurplusValue": "regulation.fuelEu.credit.surplusValueEurPerTonneVlsfoEq",
  "fossil.efficiencyRatio": "fossil.emissions.efficiencyRatio",
  "fossil.sulphurPercent": "fossil.emissions.sulphurPercent",
  "cargo.startYear": "cargo.startYear",
};

/**
 * Where a field's RESOLVED value lives, when its override slot is null.
 *
 * An unset override is the normal case — the scenario is using the model's
 * derived figure — and "null +/- 10%" is not a perturbation. Nudging the
 * RESOLVED value is what the field actually means: it answers "if the fuel
 * really costs 10% more than the model derives, what happens?", which is the
 * question elasticity is for. Without this, 11 fields including green fuel
 * price and both WtW intensities measured nothing at all.
 */
const RESOLVED_FALLBACK: Record<string, (r: ReturnType<typeof resolveScenario>) => number | null> = {
  "green.priceUsdPerTonne": (r) => r.green.priceUsdPerTonne.value as number,
  "fossil.priceUsdPerTonne": (r) => r.fossil.priceUsdPerTonne.value as number,
  "green.wtwGco2PerMj": (r) => r.green.wtw.value as number,
  "fossil.wtwGco2PerMj": (r) => r.fossil.wtw.value as number,
  "green.combustionEf": (r) => r.green.combustionEf.value as number,
  "fossil.combustionEf": (r) => r.fossil.combustionEf.value as number,
  "green.lhvMjPerTonne": (r) => r.green.lhv.value as number,
  "fossil.lhvMjPerTonne": (r) => r.fossil.lhv.value as number,
  "green.fuelTonnesPerVesselYear": (r) => r.green.tonnesPerVesselYear.value as number,
  "fossil.fuelTonnesPerVesselYear": (r) => r.fossil.tonnesPerVesselYear.value as number,
};

interface Perturbed {
  /** Relative size of the nudge actually applied, for the denominator. */
  fraction: number;
  apply: (s: ScenarioInput) => void;
}

/** Build the up/down nudges for one param on one scenario. */
function nudges(
  p: Param,
  input: ScenarioInput,
  resolvedInput: ReturnType<typeof resolveScenario>,
): { up: Perturbed; down: Perturbed } | null {
  if (!p.set) return null;
  const v = currentValue(p, input, resolvedInput);
  if (v === null || !Number.isFinite(v)) return null;
  const kind = perturbationType(p.id);
  if (kind === "absolutePp") {
    // A rate moves in points; the DENOMINATOR is still the relative change,
    // so the elasticity stays dimensionless and comparable across kinds.
    if (v === 0) return null; // 0% -> +1pp is an infinite relative change
    const step = ABSOLUTE_PP_STEP;
    return {
      up: { fraction: step / v, apply: (s) => p.set!(s, v + step) },
      down: { fraction: step / v, apply: (s) => p.set!(s, v - step) },
    };
  }
  if (v === 0) return null; // a relative nudge of zero is zero
  return {
    up: { fraction: RELATIVE_STEP, apply: (s) => p.set!(s, v * (1 + RELATIVE_STEP)) },
    down: { fraction: RELATIVE_STEP, apply: (s) => p.set!(s, v * (1 - RELATIVE_STEP)) },
  };
}

type PerKpi = Record<KpiId, number>;

/** (ΔKPI / KPI_base) / fraction, per KPI. */
function elasticityOf(base: KpiVector, moved: KpiVector, fraction: number): PerKpi {
  const out = {} as PerKpi;
  for (const { id } of KPIS) {
    const b = base[id];
    out[id] = b === 0 || fraction === 0 ? 0 : (moved[id] - b) / b / fraction;
  }
  return out;
}

const mean = (a: number, b: number) => (a + b) / 2;

function main(): void {
  const scenarios = ARCHETYPES.map((a) => {
    const input = migrateScenarioInput(JSON.parse(JSON.stringify(a.build()))).input;
    return {
      archetype: a,
      input,
      resolved: resolveScenario(input, bundle),
      base: kpisFor(input, bundle),
    };
  });

  const rows: unknown[] = [];
  const unperturbable: { id: string; reason: string }[] = [];

  for (const p of PARAMS) {
    if (p.options) {
      // Enums carry no elasticity — a categorical has no proportional nudge.
      // Their movement across options is the sweep's `discreteImpact` and is
      // reported there, not ranked here.
      unperturbable.push({ id: p.id, reason: "enum — see discreteImpact in sensitivity.json" });
      continue;
    }
    if (!PARAM_VALUE_PATH[p.id]) {
      unperturbable.push({ id: p.id, reason: "no declared value path (setter writes a composite)" });
      continue;
    }
    const perScenario: Record<string, unknown> = {};
    let measured = 0;
    for (const s of scenarios) {
      const n = nudges(p, s.input, s.resolved);
      if (!n) {
        // Distinguish the two honest reasons a field cannot be nudged, so
        // the artifact says WHICH rather than lumping them together. A
        // module-off field is a property of the archetype; a zero-valued one
        // is a property of the point (a relative nudge of 0 is 0).
        const raw = currentValue(p, s.input, s.resolved);
        perScenario[s.archetype.key] = {
          measurable: false,
          reason:
            raw === null
              ? "module off or field absent on this archetype"
              : "value is zero — a relative nudge cannot move it",
        };
        continue;
      }
      const up = elasticityOf(s.base, kpisFor(s.input, bundle, n.up.apply), n.up.fraction);
      const down = elasticityOf(s.base, kpisFor(s.input, bundle, n.down.apply), -n.down.fraction);
      const perKpi = {} as Record<KpiId, { up: number; down: number; mean: number; asymmetric: boolean }>;
      for (const { id } of KPIS) {
        const u = up[id];
        const d = down[id];
        const m = mean(Math.abs(u), Math.abs(d));
        // Asymmetry is CURVATURE, not an error: a field whose up-nudge and
        // down-nudge differ is non-linear at this point, which a single
        // elasticity number cannot say on its own.
        const asym = m === 0 ? 0 : Math.abs(Math.abs(u) - Math.abs(d)) / m;
        perKpi[id] = { up: u, down: d, mean: m, asymmetric: asym > ASYMMETRY_FLAG };
      }
      perScenario[s.archetype.key] = { measurable: true, perKpi };
      measured++;
    }
    if (measured === 0) {
      unperturbable.push({
        id: p.id,
        reason:
          "not measurable on any archetype — the block is optional and these " +
          "three scenarios do not carry it (financing, port and self-designed " +
          "sub-fields). Measuring it would mean enabling the module, which " +
          "changes what the number MEANS: the sweep does exactly that and " +
          "reports figures that read as 'the module at its range ends'.",
      });
      continue;
    }
    const groups = groupsFor(p.id);
    rows.push({
      id: p.id,
      label: p.label,
      perturbationType: perturbationType(p.id),
      coupled: groups.length > 0,
      couplingGroups: groups.map((g) => g.id),
      scenarios: perScenario,
    });
  }

  // --- group rows: members moved TOGETHER --------------------------------
  const groupRows = COUPLING_GROUPS.map((g) => {
    const members = PARAMS.filter((p) => g.members.includes(p.id) && p.set && PARAM_VALUE_PATH[p.id]);
    const perScenario: Record<string, unknown> = {};
    for (const s of scenarios) {
      const ns = members.map((m) => ({ m, n: nudges(m, s.input, s.resolved) })).filter((x) => x.n);
      if (ns.length === 0) {
        perScenario[s.archetype.key] = { measurable: false, reason: "no member measurable here" };
        continue;
      }
      // One common relative nudge, applied to every member at once — that is
      // what makes it a coupled move rather than a sum of separate ones.
      const applyAll = (dir: 1 | -1) => (sc: ScenarioInput) => {
        for (const { m, n } of ns) (dir === 1 ? n!.up : n!.down).apply(sc);
      };
      const up = elasticityOf(s.base, kpisFor(s.input, bundle, applyAll(1)), RELATIVE_STEP);
      const down = elasticityOf(s.base, kpisFor(s.input, bundle, applyAll(-1)), -RELATIVE_STEP);
      const perKpi = {} as Record<KpiId, { up: number; down: number; mean: number }>;
      for (const { id } of KPIS) {
        perKpi[id] = { up: up[id], down: down[id], mean: mean(Math.abs(up[id]), Math.abs(down[id])) };
      }
      // THE INVARIANT: a coupled energy move must leave the corridor
      // physically consistent. Asserted on the perturbed scenario itself, not
      // on its result — that is the difference between this and the sweep.
      let parityHeld: boolean | null = null;
      if (g.id === "energy-demand") {
        const probe = JSON.parse(JSON.stringify(s.input)) as ScenarioInput;
        applyAll(1)(probe);
        parityHeld = !evaluateScenario(resolveScenario(probe, bundle)).energyParity.diverged;
      }
      perScenario[s.archetype.key] = { measurable: true, perKpi, ...(parityHeld === null ? {} : { parityHeld }) };
    }
    return {
      id: g.id,
      label: g.label,
      members: members.map((m) => m.id),
      rationale: g.rationale,
      scenarios: perScenario,
    };
  });

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        generatedBy: "scripts/corridor/elasticity.ts",
        refBundleId: bundle.bundleId,
        relativeStep: RELATIVE_STEP,
        absolutePpStep: ABSOLUTE_PP_STEP,
        asymmetryFlagThreshold: ASYMMETRY_FLAG,
        note:
          "LEVERAGE only — a model property at this point, independent of any " +
          "assumed range. Exposure (declared uncertainty) is a separate " +
          "dataset; impact is the product. One-at-a-time, so interactions are " +
          "invisible here by construction — only the Monte Carlo sees those.",
        kpis: KPIS,
        // The base KPIs are published per archetype because the elasticities
        // are normalised by them, and that normalisation is easy to misread.
        // B's gap ($446m) is a small difference between two large sides
        // ($2,024m green vs $1,578m fossil), so a 10% move in either side is
        // amplified relative to the gap: its elasticities run ~2.5 where A's
        // run ~0.3. That is REAL leverage — a thin-margin corridor genuinely
        // is more sensitive — not a scaling artifact, but a reader comparing
        // the columns without the bases would reasonably suspect one.
        archetypeBase: Object.fromEntries(
          scenarios.map((s) => [s.archetype.key, s.base]),
        ),
        archetypes: ARCHETYPES.map((a) => ({ key: a.key, id: a.id, label: a.label, note: a.note })),
        rows,
        groups: groupRows,
        unperturbable,
      },
      null,
      1,
    ) + "\n",
  );
  console.log(
    `elasticity: ${rows.length} fields x ${scenarios.length} archetypes, ` +
      `${groupRows.length} groups, ${unperturbable.length} unperturbable`,
  );
  console.log(`wrote ${OUT_PATH.pathname.split("/").pop()}`);
}

main();
