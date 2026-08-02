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
  /**
   * Nameplate the prodCapex/prodOpex rows describe, t/yr (2026-08-02, additive
   * and OPTIONAL per the bundle's additive-extension rule — an older bundle
   * without it simply cannot be scale-corrected). Without a stated capacity a
   * bare "$55m" is unrelatable to any $/tpa benchmark: at 60 kt/yr it implies
   * $917/tpa for a complete green-ammonia complex, ~20x below the NEOM-derived
   * $1,400/tpa. Stating the nameplate is what makes the two commensurable and
   * lets a user typing over the row anchor it correctly.
   */
  prodNameplateTonnesPerYear: z.number().positive().optional(),
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
    // IMO Net-Zero Framework GFI reduction ladders vs the 2008 reference
    // (draft MEPC 83, provisional pending adoption). Optional: an older
    // bundle without them makes the IMO module report "not parameterised".
    imoBaseTargets: z.array(scheduleStepSchema).nonempty().optional(),
    imoDirectTargets: z.array(scheduleStepSchema).nonempty().optional(),
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
    // IMO NZF pricing/reference parameters (provisional, per sourceNote).
    // The ZNZ reward rate is deliberately ABSENT — undetermined at source.
    imoNetZero: z
      .object({
        effectiveFromCalendarYear: z.number().int(),
        referenceIntensityGco2PerMj: z.number().positive(),
        tier1UsdPerTonneCo2e: z.number().nonnegative(),
        tier2UsdPerTonneCo2e: z.number().nonnegative(),
        sourceNote: z.string(),
      })
      .optional(),
  }),
});

export type RefBundle = z.infer<typeof refBundleSchema>;
export type RefVesselType = z.infer<typeof vesselTypeSchema>;
export type RefFuel = z.infer<typeof fuelSchema>;
export type RefCountry = z.infer<typeof countrySchema>;

export function parseRefBundle(data: unknown): RefBundle {
  return refBundleSchema.parse(data);
}
