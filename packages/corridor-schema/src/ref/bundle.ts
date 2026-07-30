/**
 * Reference-bundle types + parser. Bundles are immutable and versioned
 * (`data/corridor-ref/<bundleId>.json`); a change publishes a NEW bundle id.
 * File I/O belongs to the consumer — this module parses an already-loaded
 * unknown into a typed bundle.
 */

import { z } from "zod";

const vesselTypeSchema = z.object({
  id: z.string(),
  label: z.string(),
  capexUsdM: z.number(),
  opexUsdMPerYear: z.number(),
  fuelTonnesPerYear: z.number(),
  gjPerNm: z.number(),
  verified: z.boolean(),
  sourceNote: z.string(),
});

const fuelSchema = z.object({
  id: z.string(),
  label: z.string(),
  priceUsdPerTonne: z.number(),
  combustionEfTco2PerTonne: z.number(),
  prodCapexUsdM: z.number(),
  prodOpexUsdMPerYear: z.number(),
  portStorageCapexUsdM: z.number(),
  portStorageOpexUsdMPerYear: z.number(),
  bargeCapexUsdM: z.number(),
  bargeOpexUsdMPerYear: z.number(),
  vesselCapexPremium: z.number(),
  lhvMjPerTonne: z.number(),
  wtwGco2PerMj: z.number(),
  verified: z.boolean(),
  sourceNote: z.string(),
});

const countrySchema = z.object({
  id: z.string(),
  label: z.string(),
  wacc: z.number(),
  verified: z.boolean(),
  sourceNote: z.string(),
});

const scheduleStepSchema = z.object({
  fromCalendarYear: z.number().int(),
  value: z.number(),
});

export const refBundleSchema = z.object({
  bundleId: z.string(),
  schemaVersion: z.literal(1),
  source: z.object({
    workbook: z.string(),
    sha256: z.string(),
    transcribedAt: z.string(),
    note: z.string().optional(),
  }),
  vesselTypes: z.array(vesselTypeSchema).nonempty(),
  fuels: z.array(fuelSchema).nonempty(),
  countries: z.array(countrySchema).nonempty(),
  benchmarkRules: z.object({
    fossilPortLogisticsOpexFactor: z.number(),
    fossilVesselCapexUsdM: z.number(),
    fossilPortCapexUsdM: z.number(),
  }),
  constants: z.object({
    ira45zMjPerGallon: z.number(),
  }),
  schedules: z.object({
    etsPhaseIn: z.array(scheduleStepSchema).nonempty(),
    fuelEuTargets: z.array(scheduleStepSchema).nonempty(),
  }),
  regulationDefaults: z.object({
    eurUsd: z.number(),
    ets: z.object({ euaEurPerTonne: z.number(), scope: z.number() }),
    fuelEu: z.object({
      penaltyEurPerTonne: z.number(),
      vlsfoMjPerTonne: z.number(),
      baselineGco2PerMj: z.number(),
      scope: z.number(),
    }),
    ira45z: z.object({ rateUsdPerGallon: z.number() }),
  }),
});

export type RefBundle = z.infer<typeof refBundleSchema>;
export type RefVesselType = z.infer<typeof vesselTypeSchema>;
export type RefFuel = z.infer<typeof fuelSchema>;
export type RefCountry = z.infer<typeof countrySchema>;

export function parseRefBundle(data: unknown): RefBundle {
  return refBundleSchema.parse(data);
}
