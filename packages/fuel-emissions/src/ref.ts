/**
 * Reference dataset for the fuel-emissions calculator: fuels, GWP sets,
 * frameworks, methane slip per engine, pilot-fuel and N2O-slip evidence.
 *
 * Provenance discipline (same as the corridor bundle): every fuel row
 * carries `source` + `derivation` and a `verified` flag; rows flagged
 * `verified:false` must never drive a headline number without the
 * unverified badge. The zod schema declares EVERY typed field — the
 * silent-strip bug class is the reason the corridor grew a round-trip
 * completeness test.
 *
 * The NOT-PARAMETERISED rule: a fuel whose LCV, WtT or a needed TtW gas
 * term is null for the requested calculation is reported as
 * `{ notParameterised, missing }` — never substituted from a neighbouring
 * fuel, never defaulted to zero (a missing upstream term flatters a fuel;
 * the LNG row documents exactly that trap).
 */

import { z } from "zod";

const nullableNumber = z.number().finite().nullable();

const gwpSetSchema = z.object({
  co2: z.number().positive(),
  ch4: z.number().positive(),
  n2o: z.number().positive(),
  source: z.string().min(1),
  note: z.string().optional(),
  verified: z.boolean().optional(),
});

const fuelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  family: z.enum(["fossil", "green"]),
  lcvMjPerG: z.number().positive(),
  ttw: z.object({
    co2GPerG: z.number().nonnegative().nullable(),
    ch4GPerG: z.number().nonnegative().nullable(),
    // e-ammonia carries the sentinel string "SEE n2oSlip": its N2O is an
    // engine-behaviour parameter (n2oSlip), not an Annex II factor.
    n2oGPerG: z.union([z.number().nonnegative(), z.literal("SEE n2oSlip")]).nullable(),
  }),
  wttGco2ePerMj: nullableNumber,
  wttRangeGco2ePerMj: z.tuple([z.number(), z.number()]).optional(),
  /**
   * Reference prefill for the certified pathway value (consumers may
   * present it as an editable default — it is NOT applied silently by
   * the engine, which still requires an explicit certified input).
   */
  defaultCertifiedWttGco2ePerMj: z.number().positive().optional(),
  /**
   * Framework ids under which this fuel must REFUSE despite carrying
   * values (LNG: the IMO LCA Guidelines lack a default upstream factor —
   * the row's WtT is FuelEU's and must not be borrowed).
   */
  unavailableUnder: z.array(z.string()).optional(),
  /**
   * IMO classification of fossil rows: the IMO bins residual fuels by
   * SULPHUR content (MEPC.391(81)), not ISO 8217 viscosity — the same
   * physical bunker lands in different bins under the two frameworks.
   */
  imoClass: z.enum(["residual", "distillate"]).optional(),
  /**
   * WHERE THE CARBON CAME FROM — an EU ETS question, and only an ETS one.
   *
   * The ETS Directive assigns an emission factor of ZERO to CO2 from
   * sustainable biomass and to RFNBOs meeting the GHG-saving threshold.
   * Every other basis in this dataset is indifferent to carbon origin: the
   * TtW stack factor is chemistry (methanol is a carbon molecule however it
   * was made) and the WtW pathway value already nets capture against
   * combustion. So this field must never be read outside the ETS path.
   *
   * "mixed" is for recycled carbon fuels — e-methanol from fossil
   * point-source CO2 — whose treatment is not settled. Default those to
   * fossilCarbonShare 1.0 and verified:false: a contested case does not get
   * the favourable answer by default.
   */
  carbonOrigin: z.enum(["fossil", "biogenic", "rfnbo", "mixed"]).optional(),
  /**
   * The fraction of the row's combustion CO2 that is ETS-chargeable.
   *
   * NOT a duplicate of `carbonOrigin` — that names the provenance, this
   * prices it, and "mixed" needs a number the enum cannot carry.
   *
   * CH4 and N2O are DELIBERATELY out of scope: they are charged on their
   * warming effect from 2026 regardless of where the carbon came from, so a
   * bio-LNG row still pays for methane slip and an ammonia row still pays
   * for N2O slip. Zeroing a fuel wholesale is the error this field exists
   * to prevent.
   */
  fossilCarbonShare: z.number().min(0).max(1).optional(),
  /**
   * Convenience flag mirroring `fossilCarbonShare === 0`, kept explicit so a
   * row can be marked zero-rated with a REASON in `derivation` and so the
   * validation gate has something to name. Overridable independently for a
   * row whose certificate says otherwise.
   */
  etsZeroRated: z.boolean().optional(),
  /** Legal basis for the classification above. */
  carbonOriginSource: z.string().optional(),
  /** Why this row is classified as it is, and what it does NOT cover. */
  carbonOriginNote: z.string().optional(),
  framework: z.string().min(1),
  verified: z.boolean(),
  requiresEngineType: z.boolean().optional(),
  derivation: z.string().min(1),
  validation: z.string().optional(),
  reviewNote: z.string().optional(),
  source: z.string().min(1),
});

export const refDatasetSchema = z.object({
  $schema: z.string().optional(),
  datasetVersion: z.string().min(1),
  retrievedDate: z.string().min(1),
  status: z.string().min(1),
  gwpSets: z.record(z.string(), gwpSetSchema),
  frameworks: z.record(
    z.string(),
    z.object({
      name: z.string().min(1),
      legalBasis: z.string().min(1),
      basis: z.literal("wellToWake"),
      defaultGwpSet: z.string().min(1),
      rfnboCeilingGco2ePerMj: z.number().positive().optional(),
      rfnboCeilingSource: z.string().optional(),
      biofuelReferenceEValue: z.number().optional(),
      biofuelReferenceNote: z.string().optional(),
      missingValueRule: z.string().optional(),
      referenceGfi2008: z.number().optional(),
      znzThresholdGco2ePerMj: z
        .object({ to2034: z.number(), from2035: z.number() })
        .optional(),
      znzSource: z.string().optional(),
      status: z.string().optional(),
      verified: z.boolean().optional(),
    }),
  ),
  fuels: z.array(fuelSchema).min(1),
  /** IMO's OWN fossil WtT defaults (MEPC.391(81)) — resolved by sulphur band. */
  imoFossilWtt: z.object({
    legalBasis: z.string().min(1),
    classificationNote: z.string().min(1),
    residualBySulphur: z.array(
      z.object({
        band: z.string().min(1),
        maxSulphurPercent: z.number().nullable(),
        wttGco2ePerMj: z.number(),
        label: z.string().min(1),
      }),
    ),
    distillateNote: z.string().min(1),
    lcvNote: z.string().min(1),
    source: z.string().min(1),
    verified: z.boolean(),
  }),
  methaneSlip: z.object({
    note: z.string(),
    source: z.string(),
    verified: z.boolean(),
    byEngine: z.array(
      z.object({
        engine: z.string().min(1),
        fueleu: z.number().nonnegative(),
        imo: z.number().nonnegative(),
      }),
    ),
  }),
  pilotFuel: z.object({
    note: z.string(),
    verified: z.boolean(),
    defaultShareOfEnergy: z.number().min(0).max(1),
    range: z.tuple([z.number(), z.number()]),
    defaultPilotFuelId: z.string().min(1),
    derivation: z.string(),
    source: z.string(),
  }),
  n2oSlip: z.object({
    note: z.string(),
    verified: z.boolean(),
    unit: z.string(),
    defaultValue: z.number().nonnegative(),
    range: z.tuple([z.number(), z.number()]),
    scenarios: z.array(
      z.object({
        id: z.string().min(1),
        value: z.number().nonnegative(),
        addsGco2ePerMj: z.number(),
        label: z.string().min(1),
        derivation: z.string(),
        source: z.string(),
      }),
    ),
    reviewNote: z.string(),
  }),
  engineEfficiencyRatio: z.object({
    note: z.string(),
    default: z.number().positive(),
    verified: z.boolean(),
    derivation: z.string(),
    source: z.string(),
  }),
});

export type FuelEmissionsRefDataset = z.infer<typeof refDatasetSchema>;
export type RefFuel = FuelEmissionsRefDataset["fuels"][number];
export type GwpSetId = string;

export function parseRefDataset(data: unknown): FuelEmissionsRefDataset {
  return refDatasetSchema.parse(data);
}

export function getFuel(ds: FuelEmissionsRefDataset, id: string): RefFuel {
  const row = ds.fuels.find((f) => f.id === id);
  if (!row) throw new Error(`fuel-emissions: unknown fuel id "${id}"`);
  return row;
}

export function getGwpSet(ds: FuelEmissionsRefDataset, id: string) {
  const set = ds.gwpSets[id];
  if (!set) throw new Error(`fuel-emissions: unknown GWP set "${id}"`);
  return set;
}

export function getFramework(ds: FuelEmissionsRefDataset, id: string) {
  const fw = ds.frameworks[id];
  if (!fw) throw new Error(`fuel-emissions: unknown framework "${id}"`);
  return fw;
}

/**
 * The row's combustion CO2 expressed per MJ — what the stack actually emits.
 *
 * `lcvMjPerG` is MJ per GRAM and `co2GPerG` is g per gram, so the ratio is
 * already gCO2 per MJ with no unit scaling.
 */
export function impliedCombustionIntensity(fuel: RefFuel): number | null {
  const co2 = fuel.ttw.co2GPerG;
  if (co2 === null || fuel.lcvMjPerG <= 0) return null;
  return co2 / fuel.lcvMjPerG;
}

/**
 * Is a stated well-to-wake intensity reachable from the row's own chemistry?
 *
 * A fuel cannot emit less over its WHOLE lifecycle than it emits at the stack
 * alone — unless carbon was captured on the way in, which is exactly what
 * biogenic and RFNBO carbon means. So a row stating both a low WtW and a high
 * combustion factor is making a claim that only holds if it is zero-rated,
 * and stating both WITHOUT the flag is a contradiction rather than a
 * judgement call.
 *
 * e-Methanol is the live case: certified at 15 gCO2e/MJ with a stack
 * intensity of 69.1. Before the ETS classification landed, the model netted
 * that carbon in the abatement figure and charged for it in the ETS figure.
 * This makes stating both unrepresentable rather than merely arguable.
 *
 * Returns null when the row is consistent, or a message naming both fields.
 */
export function carbonBalanceError(
  fuel: RefFuel,
  statedWtwGco2ePerMj: number | null | undefined,
): string | null {
  if (fuel.etsZeroRated) return null;
  const implied = impliedCombustionIntensity(fuel);
  if (implied === null || statedWtwGco2ePerMj == null) return null;
  if (statedWtwGco2ePerMj >= implied) return null;
  return (
    `fuel "${fuel.id}": stated well-to-wake ${statedWtwGco2ePerMj} gCO2e/MJ is below its own ` +
    `combustion intensity ${implied.toFixed(1)} gCO2/MJ ` +
    `(ttw.co2GPerG ${fuel.ttw.co2GPerG} / lcvMjPerG ${fuel.lcvMjPerG}). ` +
    `That is only reachable if the carbon was captured — set carbonOrigin ` +
    `and fossilCarbonShare (etsZeroRated) on the row, or correct one of the two figures.`
  );
}

/** Fields a fuel is missing for a full WtW evaluation (empty = complete). */
export function missingParameters(fuel: RefFuel): string[] {
  const missing: string[] = [];
  if (fuel.wttGco2ePerMj === null && !fuel.wttRangeGco2ePerMj) {
    missing.push("wttGco2ePerMj");
  }
  if (fuel.ttw.co2GPerG === null) missing.push("ttw.co2GPerG");
  if (fuel.ttw.ch4GPerG === null) missing.push("ttw.ch4GPerG");
  if (fuel.ttw.n2oGPerG === null) missing.push("ttw.n2oGPerG");
  if (fuel.requiresEngineType) missing.push("engineType (per-engine methane slip)");
  return missing;
}
