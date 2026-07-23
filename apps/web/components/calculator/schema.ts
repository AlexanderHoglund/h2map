import { z } from "zod";
import { REFERENCE_DEFAULTS } from "@h2map/lcoh-engine";
import type { ProfileKind, PvKind, WindKind } from "./types";

/**
 * UI form schema. Maps 1:1 onto the POST /api/v1/simulate payload
 * (lcohInputsSchema in lib/api/schemas.ts) via `toSimulateBody`. Percentages
 * are held as whole numbers in the UI (8 = 8 %/yr) and divided by 100 at the
 * boundary; `coupled` flags and `pricingMode` are UI-only state that also
 * round-trips through the `?c=` share link.
 */

export const PV_KINDS = ["pv_fixed", "pv_1axis", "pv_2axis"] as const;
export const WIND_KINDS = ["wind_120", "wind_160"] as const;

type Msg = (key: string, values?: Record<string, string | number>) => string;

export function makeCalculatorSchema(t: Msg) {
  const num = (min: number, max: number) =>
    z
      .number({ error: t("errors.number") })
      .min(min, t("errors.min", { min }))
      .max(max, t("errors.max", { max }));
  const pos = (max: number) =>
    z
      .number({ error: t("errors.number") })
      .positive(t("errors.positive"))
      .max(max, t("errors.max", { max }));

  const pricingFields = {
    pricingMode: z.enum(["lcoe", "capex"]),
    lcoeUsdPerMwh: num(0, 10_000),
    capexUsdPerKw: num(0, 100_000),
    opexPctPerYear: num(0, 100),
  };

  return z.object({
    location: z.object({
      lat: num(-90, 90),
      lon: num(-180, 180),
      country: z.string().nullable(),
    }),
    general: z.object({
      lifetimeYears: pos(60),
      discountRatePct: num(0, 50),
      waterPriceUsdPerM3: num(0, 1_000),
      waterTransportUsdPerM3Per100Km: num(0, 1_000),
      waterTransportDistanceKm: num(0, 10_000),
      waterDesalinated: z.boolean(),
      waterPumpingHeadM: num(0, 10_000),
    }),
    electrolyzer: z.object({
      capacityMw: pos(100_000),
      efficiencyPct: pos(100),
      capexUsdPerKw: num(0, 100_000),
      opexPctPerYear: num(0, 100),
      stackLifetimeHours: pos(500_000),
      stackReplacementPct: num(0, 100),
      degradationPctPerYear: num(0, 50),
    }),
    pv: z.object({
      enabled: z.boolean(),
      capacityMw: pos(1_000_000),
      coupled: z.boolean(),
      kind: z.enum(PV_KINDS),
      ...pricingFields,
    }),
    wind: z.object({
      enabled: z.boolean(),
      capacityMw: pos(1_000_000),
      coupled: z.boolean(),
      kind: z.enum(WIND_KINDS),
      ...pricingFields,
    }),
    grid: z.object({
      enabled: z.boolean(),
      priceUsdPerMwh: num(0, 10_000),
      maxImportMw: pos(1_000_000),
      coupled: z.boolean(),
      emissionFactorTco2PerMwh: num(0, 5),
    }),
  });
}

export type CalculatorValues = z.infer<ReturnType<typeof makeCalculatorSchema>>;
export type SectionKey = keyof CalculatorValues;

const D = REFERENCE_DEFAULTS;
const GRID_EF_FALLBACK = D.grid?.emissionFactorTco2PerMwh ?? 0.4;

/** Doc-literal reference defaults mapped into UI units (Atacama start point). */
export const CALCULATOR_DEFAULTS: CalculatorValues = {
  location: { lat: -23.5, lon: -69.4, country: null },
  general: {
    lifetimeYears: D.finance.lifetimeYears,
    discountRatePct: D.finance.discountRate * 100,
    waterPriceUsdPerM3: D.water.priceUsdPerM3,
    waterTransportUsdPerM3Per100Km: D.water.transportUsdPerM3Per100Km,
    waterTransportDistanceKm: 0,
    waterDesalinated: false,
    waterPumpingHeadM: 0,
  },
  electrolyzer: {
    capacityMw: D.electrolyzer.capacityMw,
    efficiencyPct: D.electrolyzer.efficiencyLhv * 100,
    capexUsdPerKw: D.electrolyzer.capexUsdPerKw,
    opexPctPerYear: D.electrolyzer.opexFractionPerYear * 100,
    stackLifetimeHours: D.electrolyzer.stackLifetimeHours,
    stackReplacementPct: D.electrolyzer.stackReplacementCostFraction * 100,
    degradationPctPerYear: D.electrolyzer.degradationPerYear * 100,
  },
  pv: {
    enabled: true,
    capacityMw: D.electrolyzer.capacityMw,
    coupled: true,
    kind: "pv_fixed",
    pricingMode: "lcoe",
    lcoeUsdPerMwh: 30,
    capexUsdPerKw: 850,
    opexPctPerYear: 1,
  },
  wind: {
    enabled: true,
    capacityMw: D.electrolyzer.capacityMw,
    coupled: true,
    kind: "wind_120",
    pricingMode: "lcoe",
    lcoeUsdPerMwh: 30,
    capexUsdPerKw: 850,
    opexPctPerYear: 1,
  },
  grid: {
    enabled: false,
    priceUsdPerMwh: 30,
    maxImportMw: D.electrolyzer.capacityMw,
    coupled: true,
    emissionFactorTco2PerMwh: GRID_EF_FALLBACK,
  },
};

function pricing(src: CalculatorValues["pv"] | CalculatorValues["wind"]) {
  return src.pricingMode === "lcoe"
    ? { mode: "lcoe" as const, usdPerMwh: src.lcoeUsdPerMwh }
    : {
        mode: "capex" as const,
        capexUsdPerKw: src.capexUsdPerKw,
        opexFractionPerYear: src.opexPctPerYear / 100,
      };
}

/** Body of POST /api/v1/simulate built from validated form values. */
export function toSimulateBody(v: CalculatorValues) {
  const { lat, lon } = v.location;
  return {
    inputs: {
      finance: {
        lifetimeYears: v.general.lifetimeYears,
        discountRate: v.general.discountRatePct / 100,
      },
      electrolyzer: {
        capacityMw: v.electrolyzer.capacityMw,
        capexUsdPerKw: v.electrolyzer.capexUsdPerKw,
        opexFractionPerYear: v.electrolyzer.opexPctPerYear / 100,
        efficiencyLhv: v.electrolyzer.efficiencyPct / 100,
        degradationPerYear: v.electrolyzer.degradationPctPerYear / 100,
        stackLifetimeHours: v.electrolyzer.stackLifetimeHours,
        stackReplacementCostFraction: v.electrolyzer.stackReplacementPct / 100,
      },
      ...(v.pv.enabled
        ? { pv: { capacityMw: v.pv.capacityMw, pricing: pricing(v.pv) } }
        : {}),
      ...(v.wind.enabled
        ? { wind: { capacityMw: v.wind.capacityMw, pricing: pricing(v.wind) } }
        : {}),
      ...(v.grid.enabled
        ? {
            grid: {
              maxImportMw: v.grid.maxImportMw,
              priceUsdPerMwh: v.grid.priceUsdPerMwh,
              emissionFactorTco2PerMwh: v.grid.emissionFactorTco2PerMwh,
            },
          }
        : {}),
      water: {
        priceUsdPerM3: v.general.waterPriceUsdPerM3,
        transportUsdPerM3Per100Km: v.general.waterTransportUsdPerM3Per100Km,
        transportDistanceKm: v.general.waterTransportDistanceKm,
        desalinated: v.general.waterDesalinated,
        pumpingHeadM: v.general.waterPumpingHeadM,
      },
    },
    profiles: {
      ...(v.pv.enabled ? { pv: { lat, lon, kind: v.pv.kind } } : {}),
      ...(v.wind.enabled ? { wind: { lat, lon, kind: v.wind.kind } } : {}),
    },
  };
}

/** Profiles the staged runner must prefetch for these values. */
export function wantedProfiles(
  v: CalculatorValues,
): { slot: "pv" | "wind"; kind: ProfileKind }[] {
  const wanted: { slot: "pv" | "wind"; kind: ProfileKind }[] = [];
  if (v.pv.enabled) wanted.push({ slot: "pv", kind: v.pv.kind });
  if (v.wind.enabled) wanted.push({ slot: "wind", kind: v.wind.kind });
  return wanted;
}

export function anySourceEnabled(v: CalculatorValues): boolean {
  return v.pv.enabled || v.wind.enabled || v.grid.enabled;
}

export function isSectionDirty(v: CalculatorValues, key: SectionKey): boolean {
  return JSON.stringify(v[key]) !== JSON.stringify(CALCULATOR_DEFAULTS[key]);
}

/** Tolerant merge of a decoded `?c=` config over the defaults. */
export function mergeConfig(decoded: unknown): CalculatorValues {
  const out: CalculatorValues = structuredClone(CALCULATOR_DEFAULTS);
  if (typeof decoded !== "object" || decoded === null) return out;
  const src = decoded as Record<string, Record<string, unknown>>;
  for (const section of Object.keys(out) as SectionKey[]) {
    const from = src[section];
    if (typeof from !== "object" || from === null) continue;
    const into = out[section] as Record<string, unknown>;
    for (const field of Object.keys(into)) {
      if (field in from && typeof from[field] === typeof into[field]) {
        into[field] = from[field];
      } else if (field === "country" && (from[field] === null || typeof from[field] === "string")) {
        into[field] = from[field];
      }
    }
  }
  // Enum sanity — a corrupted link must not send an invalid kind.
  if (!PV_KINDS.includes(out.pv.kind as PvKind)) out.pv.kind = "pv_fixed";
  if (!WIND_KINDS.includes(out.wind.kind as WindKind)) out.wind.kind = "wind_120";
  if (out.pv.pricingMode !== "lcoe" && out.pv.pricingMode !== "capex") out.pv.pricingMode = "lcoe";
  if (out.wind.pricingMode !== "lcoe" && out.wind.pricingMode !== "capex") out.wind.pricingMode = "lcoe";
  return out;
}
