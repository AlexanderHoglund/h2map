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
