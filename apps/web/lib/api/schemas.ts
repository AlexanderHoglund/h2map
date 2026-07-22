import { z } from "zod";

/**
 * Boundary validation for /api/v1. Shape-level only where the engine already
 * enforces deep numeric invariants (validateInputs throws EngineInputError
 * with a field path, mapped to 400 by the routes).
 */

export const profileKindSchema = z.enum([
  "pv_fixed",
  "pv_1axis",
  "pv_2axis",
  "wind_120",
  "wind_160",
]);

const latSchema = z.coerce.number().min(-90).max(90);
const lonSchema = z.coerce.number().min(-180).max(180);

export const resourceProfileQuerySchema = z.object({
  lat: latSchema,
  lon: lonSchema,
  kind: profileKindSchema,
});

const pricingSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("lcoe"), usdPerMwh: z.number() }),
  z.object({
    mode: z.literal("capex"),
    capexUsdPerKw: z.number(),
    opexFractionPerYear: z.number(),
  }),
]);

const renewableSourceSchema = z.object({
  capacityMw: z.number(),
  pricing: pricingSchema,
});

export const lcohInputsSchema = z.object({
  finance: z.object({
    lifetimeYears: z.number(),
    discountRate: z.number(),
  }),
  electrolyzer: z.object({
    capacityMw: z.number(),
    capexUsdPerKw: z.number(),
    opexFractionPerYear: z.number(),
    efficiencyLhv: z.number(),
    degradationPerYear: z.number(),
    stackLifetimeHours: z.number(),
    stackReplacementCostFraction: z.number(),
  }),
  pv: renewableSourceSchema.optional(),
  wind: renewableSourceSchema.optional(),
  grid: z
    .object({
      maxImportMw: z.number(),
      priceUsdPerMwh: z.number(),
      emissionFactorTco2PerMwh: z.number(),
    })
    .optional(),
  water: z.object({
    priceUsdPerM3: z.number(),
    transportUsdPerM3Per100Km: z.number(),
    transportDistanceKm: z.number(),
    desalinated: z.boolean(),
    pumpingHeadM: z.number(),
  }),
  referenceFlags: z
    .object({
      nameplateEfficiencyInFirstYear: z.boolean().optional(),
      resetEfficiencyOnStackReplacement: z.boolean().optional(),
      lcoePaysForCurtailedEnergy: z.boolean().optional(),
    })
    .optional(),
});

/** Either an inline 8760 CF array or a location reference resolved server-side. */
const profileRefSchema = z.union([
  z.array(z.number().min(0).max(1)).length(8760),
  z.object({ lat: latSchema, lon: lonSchema, kind: profileKindSchema }),
]);

export const simulateBodySchema = z
  .object({
    inputs: lcohInputsSchema,
    profiles: z
      .object({
        pv: profileRefSchema.optional(),
        wind: profileRefSchema.optional(),
      })
      .default({}),
  })
  .check((ctx) => {
    const { inputs, profiles } = ctx.value;
    for (const source of ["pv", "wind"] as const) {
      if (inputs[source] && !profiles[source]) {
        ctx.issues.push({
          code: "custom",
          message: `inputs.${source} is present but profiles.${source} is missing`,
          path: ["profiles", source],
          input: profiles[source],
        });
      }
      const ref = profiles[source];
      if (ref && !Array.isArray(ref)) {
        const wantPrefix = source === "pv" ? "pv_" : "wind_";
        if (!ref.kind.startsWith(wantPrefix)) {
          ctx.issues.push({
            code: "custom",
            message: `profiles.${source}.kind must be a ${wantPrefix}* kind, got ${ref.kind}`,
            path: ["profiles", source, "kind"],
            input: ref.kind,
          });
        }
      }
    }
  });

/** Batch H3 cell lookup for the Explorer choropleth. */
export const hexRequestSchema = z.object({
  ids: z
    .array(z.string().regex(/^[0-9a-f]{15}$/))
    .min(1)
    .max(4096),
});

export const defaultsQuerySchema = z.object({
  country: z
    .string()
    .length(2)
    .transform((s) => s.toUpperCase())
    .optional(),
});

export type SimulateBody = z.infer<typeof simulateBodySchema>;
export type ProfileRef = z.infer<typeof profileRefSchema>;
