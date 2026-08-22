/**
 * Zod validation for raw scenario input. Boundary/shape validation plus the
 * range constraints the workbook implies (horizon ≤ 40, non-negative counts).
 * Deeper numeric invariants live where they are used (resolution/engine).
 */

import { z } from "zod";
import { SCHEMA_VERSION, type ScenarioInput } from "./scenario";

const nullableNumber = z.number().finite().nullable();

/** v7: per-ship, multiplied by cargo.vessels in the engine. */
const vesselSideSchema = z.object({
  capexUsdMPerShip: nullableNumber,
  opexUsdMPerShipPerYear: nullableNumber,
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

const buildHereComponentSchema = z.object({
  derivedUsdM: z.number().nonnegative(),
  overrideUsdM: z.number().nonnegative().nullable(),
});

const fuelSideSchema = z
  .object({
    fuelId: z.string().min(1),
    sourcing: z.enum(["purchase", "build-plant", "build-here"]),
    buildHere: z
      .object({
        h3: z.string().min(1),
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
        evaluated: z.object({
          lcohUsdPerKg: z.number().positive(),
          annualH2Kg: z.number().positive(),
          capitalUsd: z.number().nonnegative(),
          annualOperatingUsd: z.number().nonnegative(),
          lcohDiscountRate: z.number().min(0).max(1),
          lcohEngineVersion: z.string().min(1),
          plantLifeYears: z.number().int().positive(),
        }),
        components: z.object({
          h2Capital: buildHereComponentSchema,
          h2Operating: buildHereComponentSchema,
          synthCapital: buildHereComponentSchema,
          synthOperating: buildHereComponentSchema,
          logisticsOperating: buildHereComponentSchema,
        }),
        firming: z
          .object({
            evaluatedDuty: z.number().min(0).max(1),
            requiredDuty: z.number().min(0).max(1),
            strategy: z.enum(["buffer-oversize", "firm-ppa", "grid-hybrid"]),
            strategyOverridden: z.boolean(),
            capitalUsdM: z.number().nonnegative(),
            operatingUsdMPerYear: z.number().nonnegative(),
            emissionsTco2PerYear: z.number().nonnegative(),
          })
          .nullable()
          .optional(),
        sizing: z.object({
          nameplateTonnesPerYear: z.number().positive(),
          nameplateMargin: z.number().min(1),
          scaleFactor: z.number().positive(),
          archetype: z
            .enum(["foak-dedicated", "noak-merchant", "match-study"])
            .optional(),
          foakMultiplier: z.number().positive(),
          surplusTonnesPerYear: z.number().nonnegative(),
          distanceKm: z.number().nonnegative(),
        }),
      })
      .nullable()
      .optional(),
    overrides: fuelSideOverridesSchema,
    // v6 — per-side refined-emissions inputs (null = dataset default).
    emissions: z
      .object({
        certifiedWttGco2ePerMj: z.number().positive().nullable(),
        n2oScenarioId: z.string().min(1).nullable(),
        pilotShare: z.number().min(0).max(1).nullable(),
        pilotFuelId: z.string().min(1).nullable(),
        engineType: z.string().min(1).nullable(),
        sulphurPercent: z.number().positive().nullable(),
        efficiencyRatio: z.number().positive().nullable(),
      })
      .optional(),
  })
  // build-here without an evaluated site has nothing to derive from.
  .refine((s) => s.sourcing !== "build-here" || s.buildHere != null, {
    message: "build-here sourcing requires an evaluated buildHere site",
  });

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
    // Both optional: absent reproduces the pre-v3 arithmetic exactly, so
    // no schema bump and no migration.
    serviceSpeedKn: z.number().positive().optional(),
    portDaysPerRoundTrip: z.number().nonnegative().optional(),
    waccOverride: nullableNumber,
    // Descriptive / presentation-only additions (absent = legacy scenario):
    // cargo-unit identity + weight, and named ports. None affect the engine.
    unit: z.enum(["tonne", "teu", "passenger"]).optional(),
    unitWeightTonnes: z.number().positive().optional(),
    portAName: z.string().max(120).optional(),
    portACoords: z
      .object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) })
      .optional(),
    portBName: z.string().max(120).optional(),
    countryBId: z.string().max(80).optional(),
    portBCoords: z
      .object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) })
      .optional(),
    // Adopted routed distance + its graph version (provenance; engine-inert).
    routedDistance: z
      .object({
        nm: z.number().positive(),
        graphVersion: z.string().min(1),
        via: z.enum(["panama", "suez"]).nullable(),
      })
      .optional(),
  }),
  vessel: z.object({
    typeId: z.string().min(1),
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
      euaEscalation: z.number().gt(-1).lt(1).optional(),
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
      creditUsdPerGallon: z.number().nonnegative(),
      effectiveUntil: z.number().int().nullable().optional(),
    }),
    selfDesigned: z.object({
      enabled: z.boolean(),
      co2PriceUsdPerTonne: z.number().finite(),
      // Was typed but MISSING here — the round-trip completeness test
      // caught the strip (same class as the imoNetZero gap below).
      co2PriceEscalation: z.number().gt(-1).lt(1).optional(),
      supportUsdPerKg: z.number().finite(),
      capexSupport: z.number().min(0).max(1),
      opexSupport: z.number().min(0).max(1),
      otherUsdM: z.number().finite(),
    }),
    // Was typed but MISSING here — z.object strips unknown keys, so an API
    // save silently dropped the module. Additive fix (sprint 4).
    imoNetZero: z
      .object({
        enabled: z.boolean(),
        scope: z.number().min(0).max(1),
        rewardUsdPerTonneCo2e: z.number().nonnegative().optional(),
        priceEscalation: z.number().gt(-1).lt(1).optional(),
      })
      .optional(),
    // v6 — refined emission accounting (declared here or silently
    // stripped; see the imoNetZero note above).
    emissions: z
      .object({ framework: z.enum(["fueleu", "imo"]) })
      .optional(),
  }),
  // Green-financing effect line (sprint 4, task 1). Absent = off.
  financing: z
    .object({
      enabled: z.boolean(),
      greenRate: z.number().min(0).max(1),
      baseRate: z.number().min(0).max(1),
      debtShare: z.number().min(0).max(1),
      tenorYears: z.number().int().min(1).max(40),
      structure: z.enum(["amortizing", "bullet"]),
    })
    .optional(),
  // Cargo-owner willingness to pay, $/tCO2e abated. Absent or 0 = off.
  // Bounded rather than open: this funds an abatement cost the model
  // measures in the hundreds to low thousands of $/tCO2, so a five-figure
  // entry is a unit error (a $/tonne-of-cargo or a total) rather than a
  // negotiation. Non-negative — a cargo owner paying LESS than nothing is
  // not a willingness to pay, it is a discount, and belongs in the price.
  commercial: z
    .object({
      willingnessToPayUsdPerTonneCo2: z.number().min(0).max(10_000),
    })
    .optional(),
  // Capital deployment schedule (sprint 4, task 2). The sum-to-1 rule is
  // enforced BY NAME when enabled — weights are never silently normalised.
  capitalPhasing: z
    .object({
      enabled: z.boolean(),
      green: z.object({
        weights: z.array(z.number().nonnegative()).min(1).max(10),
      }),
      fossil: z.object({
        weights: z.array(z.number().nonnegative()).min(1).max(10),
      }),
    })
    .superRefine((val, ctx) => {
      if (!val.enabled) return;
      for (const side of ["green", "fossil"] as const) {
        const sum = val[side].weights.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 1) > 1e-6) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [side, "weights"],
            message: `capitalPhasing.${side}.weights must sum to 1 (got ${sum})`,
          });
        }
      }
    })
    .optional(),
  flags: z
    .object({
      emissionsBasis: z.enum(["combustion", "wellToWake"]).optional(),
      rateBasis: z.enum(["nominal", "real"]).optional(),
      legacyExcelConstruct: z.boolean().optional(),
      migratedVesselBenchmarkBurn: z.boolean().optional(),
      fossilFleetBasis: z.enum(["existing", "newbuild"]).optional(),
    })
    .optional(),
});

export function parseScenarioInput(data: unknown): ScenarioInput {
  return scenarioInputSchema.parse(data) as ScenarioInput;
}
