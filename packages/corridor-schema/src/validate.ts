/**
 * Zod validation for raw scenario input. Boundary/shape validation plus the
 * range constraints the workbook implies (horizon ≤ 40, non-negative counts).
 * Deeper numeric invariants live where they are used (resolution/engine).
 */

import { z } from "zod";
import { SCHEMA_VERSION, type ScenarioInput } from "./scenario";

const nullableNumber = z.number().finite().nullable();

const vesselSideSchema = z.object({
  capexUsdM: nullableNumber,
  opexUsdMPerYear: nullableNumber,
});

const fuelSideOverridesSchema = z.object({
  priceUsdPerTonne: nullableNumber,
  combustionEfTco2PerTonne: nullableNumber,
  lhvMjPerTonne: nullableNumber,
  wtwGco2PerMj: nullableNumber,
  fuelTonnesPerVesselYear: nullableNumber,
  prodCapexUsdM: nullableNumber,
  prodOpexUsdMPerYear: nullableNumber,
  portStorageCapexUsdM: nullableNumber,
  portStorageOpexUsdMPerYear: nullableNumber,
  bargeCapexUsdM: nullableNumber,
  bargeOpexUsdMPerYear: nullableNumber,
});

const fuelSideSchema = z
  .object({
    fuelId: z.string().min(1),
    sourcing: z.enum(["construct", "purchase", "named-plant", "build-here"]),
    deliveredPriceUsdPerTonne: z.number().finite().nullable().optional(),
    buildHere: z
      .object({
        h3: z.string().min(1),
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
        lcohUsdPerKg: z.number().positive(),
        carrierId: z.string().min(1),
        synthesisGateUsdPerTonne: z.number().positive(),
        distanceKm: z.number().nonnegative(),
        logisticsUsdPerTonne: z.number().nonnegative(),
      })
      .nullable()
      .optional(),
    overrides: fuelSideOverridesSchema,
  })
  .refine(
    (s) =>
      !(s.sourcing === "named-plant" || s.sourcing === "build-here") ||
      s.deliveredPriceUsdPerTonne != null,
    { message: "delivered-price sourcing requires deliveredPriceUsdPerTonne" },
  );

export const scenarioInputSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  refBundleId: z.string().min(1),
  cargo: z.object({
    countryId: z.string().min(1),
    routeType: z.enum(["point-to-point", "single-point"]),
    oneWayDistanceNm: z.number().positive(),
    startYear: z.number().int().min(2000).max(2100),
    horizonYears: z.number().int().min(1).max(40),
    unitsPerYear: z.number().nonnegative(),
    inflation: z.number().finite(),
    vessels: z.number().int().positive(),
    roundtripsPerYear: z.number().positive(),
    waccOverride: nullableNumber,
  }),
  vessel: z.object({
    typeId: z.string().min(1),
    consumptionMode: z.enum(["distance", "vessel-benchmark"]),
    green: vesselSideSchema,
    fossil: vesselSideSchema,
  }),
  green: fuelSideSchema,
  fossil: fuelSideSchema,
  regulation: z.object({
    eurUsd: z.number().positive(),
    ets: z.object({
      enabled: z.boolean(),
      euaEurPerTonne: z.number().nonnegative(),
      scope: z.number().min(0).max(1),
      gasCoverage: z
        .object({
          enabled: z.boolean(),
          fromCalendarYear: z.number().int(),
          gwpCh4: z.number().positive(),
          gwpN2o: z.number().positive(),
          green: z.object({
            ch4TPerTonne: z.number().nonnegative(),
            n2oTPerTonne: z.number().nonnegative(),
          }),
          fossil: z.object({
            ch4TPerTonne: z.number().nonnegative(),
            n2oTPerTonne: z.number().nonnegative(),
          }),
        })
        .optional(),
    }),
    fuelEu: z.object({
      enabled: z.boolean(),
      penaltyEurPerTonne: z.number().nonnegative(),
      vlsfoMjPerTonne: z.number().positive(),
      baselineGco2PerMj: z.number().positive(),
      scope: z.number().min(0).max(1),
      credit: z
        .object({
          enabled: z.boolean(),
          surplusValueEurPerTonneVlsfoEq: z.number().nonnegative(),
          rfnbo: z.boolean(),
          rfnboMultiplier: z.number().min(1),
          rfnboUntil: z.number().int(),
        })
        .optional(),
    }),
    ira45z: z.object({
      enabled: z.boolean(),
      usProduced: z.boolean(),
      rateUsdPerGallon: z.number().nonnegative(),
      effectiveUntil: z.number().int().nullable().optional(),
    }),
    selfDesigned: z.object({
      enabled: z.boolean(),
      co2PriceUsdPerTonne: z.number().finite(),
      supportUsdPerKg: z.number().finite(),
      capexSupport: z.number().min(0).max(1),
      opexSupport: z.number().min(0).max(1),
      otherUsdM: z.number().finite(),
    }),
  }),
  flags: z
    .object({
      emissionsBasis: z.enum(["combustion", "wellToWake"]).optional(),
      rateBasis: z.enum(["nominal", "real"]).optional(),
    })
    .optional(),
});

export function parseScenarioInput(data: unknown): ScenarioInput {
  return scenarioInputSchema.parse(data) as ScenarioInput;
}
