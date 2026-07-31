/**
 * H2→carrier synthesis + logistics planning benchmarks (build-plan 1.5/1.6).
 *
 * These are PLANNING-LEVEL defaults with explicit provenance, kept in the
 * schema layer (data, not physics) so the engine stays pure and a future
 * reference-bundle version can supersede them (ref_fuels extension columns —
 * the DB home is prepared, values live here until a verified dataset lands).
 * Every value is overridable through SynthesisConfig.
 *
 * Sources / rationale:
 * - Stoichiometry: NH3 3H2+N2→2NH3 ⇒ 0.1785 t H2/t NH3 (build-plan: 0.178,
 *   + ASU N2 electricity); MeOH CO2+3H2→CH3OH+H2O ⇒ 0.189 t H2/t (+1.374 t
 *   CO2 feedstock); LH2 is hydrogen (1.0) + liquefaction 6–10 kWh/kg (build
 *   plan) — 8 kWh/kg used as the midpoint.
 * - Plant CAPEX/OPEX: planning-level synthesis-loop+ASU (NH3) and
 *   MeOH-synthesis magnitudes consistent with the workbook's own $55m/small
 *   corridor plant and the cross-check band (LCOH $4.1/kg → delivered
 *   e-ammonia $800–950/t, Excel benchmark $900).
 * - Shipping $/t·km: planning-level deep-sea bulk/gas-carrier freight
 *   magnitudes; LH2 markedly higher (boil-off, cryo tonnage scarcity).
 */

export interface SynthesisBenchmark {
  /** Matches the corridor fuel id (`ref_fuels.id`). */
  carrierId: "e-ammonia" | "e-methanol" | "lh2";
  /** Tonnes of H2 feedstock per tonne of carrier (stoichiometric). */
  tH2PerTonne: number;
  /** CO2 feedstock, tonnes per tonne of carrier (MeOH only). */
  co2TPerTonne: number;
  /** Synthesis/ASU/liquefaction electricity, MWh per tonne of carrier. */
  electricityMwhPerTonne: number;
  /**
   * Plant CAPEX per tonne-per-annum of capacity (USD/tpa) AT the reference
   * scale below. Corridor plants are small/dedicated/FOAK — apply the
   * six-tenths correction via `synthesizePlant`; a 60 kt/yr plant against a
   * 500 kt reference carries ~2.34× the specific capital.
   */
  plantCapexUsdPerTpa: number;
  /** Scale at which plantCapexUsdPerTpa holds (world-scale merchant plant). */
  referenceScaleTonnesPerYear: number;
  /** Capacity exponent for the specific-capital scale curve (six-tenths rule). */
  scaleExponent: number;
  /** Fixed O&M as a fraction of CAPEX per year. */
  plantOpexFracPerYear: number;
  plantLifeYears: number;
  /** Sea freight, USD per tonne-km (great-circle basis; route factor applies). */
  shippingUsdPerTonneKm: number;
  verified: false;
  sourceNote: string;
}

const NOTE =
  "Planning-level benchmark (unverified). Scale reference 500 kt/yr, exponent 0.6 (six-tenths rule; applies to SYNTHESIS PLANT CAPITAL only - electrolysers/renewables are ~linear in capacity and already carried by the LCOH engine). Planning-level, unverified."
  + "  — see ref/synthesis.ts header; replace via SynthesisConfig or a future reference bundle.";

export const SYNTHESIS_BENCHMARKS: readonly SynthesisBenchmark[] = [
  {
    carrierId: "e-ammonia",
    tH2PerTonne: 0.178,
    co2TPerTonne: 0,
    electricityMwhPerTonne: 0.35, // ASU + synthesis loop
    plantCapexUsdPerTpa: 1200,
    referenceScaleTonnesPerYear: 500_000,
    scaleExponent: 0.6,
    plantOpexFracPerYear: 0.03,
    plantLifeYears: 25,
    shippingUsdPerTonneKm: 0.012,
    verified: false,
    sourceNote: NOTE,
  },
  {
    carrierId: "e-methanol",
    tH2PerTonne: 0.189,
    co2TPerTonne: 1.374,
    electricityMwhPerTonne: 0.5,
    plantCapexUsdPerTpa: 1000,
    referenceScaleTonnesPerYear: 500_000,
    scaleExponent: 0.6,
    plantOpexFracPerYear: 0.03,
    plantLifeYears: 25,
    shippingUsdPerTonneKm: 0.01,
    verified: false,
    sourceNote: NOTE,
  },
  {
    carrierId: "lh2",
    tH2PerTonne: 1.0,
    co2TPerTonne: 0,
    electricityMwhPerTonne: 8.0, // liquefaction ~8 kWh/kg (6–10 band midpoint)
    plantCapexUsdPerTpa: 900, // liquefier
    referenceScaleTonnesPerYear: 500_000,
    scaleExponent: 0.6,
    plantOpexFracPerYear: 0.04,
    plantLifeYears: 25,
    shippingUsdPerTonneKm: 0.05,
    verified: false,
    sourceNote: NOTE,
  },
];

export function getSynthesisBenchmark(carrierId: string): SynthesisBenchmark {
  const hit = SYNTHESIS_BENCHMARKS.find((b) => b.carrierId === carrierId);
  if (!hit) throw new Error(`no synthesis benchmark for carrier "${carrierId}"`);
  return hit;
}

/**
 * Synthesis evaluation config. `productionWacc` is divergence D7: the plant
 * is financed at the PRODUCTION country's cost of capital, which is a
 * different number from the corridor NPV's discount rate (a Chilean plant
 * financed at Danish 5.5% is a wrong number) — keep the two clearly apart.
 */
export interface SynthesisConfig {
  productionWacc: number;
  electricityUsdPerMwh: number;
  /** CO2 feedstock price (point-source ≈ 30–60, DAC ≈ 200+). MeOH only. */
  co2UsdPerTonne: number;
}

/** Plant-level config for `synthesizePlant` (corridor build-here spec §3). */
export interface SynthesisPlantConfig extends SynthesisConfig {
  /** The plant's nameplate capacity, tonnes of carrier per year. */
  nameplateTonnesPerYear: number;
  /**
   * First-of-a-kind multiplier on synthesis plant capital. Default 1.0 —
   * inert unless set; carries provenance in the scenario when used.
   */
  foakMultiplier?: number;
}
