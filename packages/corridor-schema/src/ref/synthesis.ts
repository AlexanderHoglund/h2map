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
  /**
   * INLAND first-mile haulage, USD per tonne-km — plant→bunker port. An order
   * of magnitude above sea freight (road/rail/short pipeline vs deep-sea
   * bulk): ammonia road haulage runs ~$0.10-0.15/t·km. Using the sea rate for
   * an ~80 km inland leg understated it ~8× (it priced a 116 km leg at
   * $1.81/t, i.e. 0.14% of production cost).
   */
  inlandUsdPerTonneKm: number;
  verified: false;
  sourceNote: string;
}

/**
 * NEOM anchor (2026-08-02 realism pass). The former 500 kt/yr reference scale
 * was unanchored to any real project; these values are now tied to the
 * largest green-ammonia project to reach FID.
 *
 * NEOM Green Hydrogen Company (FID May 2023; Air Products / ACWA Power / NEOM):
 * USD 8.4bn total, 1.2 Mt NH3/yr, ~219 kt H2/yr, 2.2 GW electrolysis,
 * ~3.8 GW dedicated renewables (2.2 GW solar + 1.6 GW wind) → $7,000/tpa
 * all-in at world scale, excellent resource, low cost of capital.
 *
 * DECOMPOSITION — the corridor prices the electrolyser island and the
 * renewables SEPARATELY (LCOH engine), so the synthesis benchmark must cover
 * only the rest: HB loop, ASU, storage, site and jetty. Subtracting at
 * NEOM's own 2023 procurement:
 *
 *   total                                    $8.40bn   ($7,000/tpa)
 *   − renewables  2.2 GWp solar @ $800/kWp   $1.76bn
 *                 1.6 GW wind  @ $1,200/kW   $1.92bn
 *   − electrolysis 2.2 GW @ $1,200-1,500/kW  $2.64-3.30bn
 *   = synthesis/ASU/storage/site/jetty       $1.42-2.08bn
 *                                          → $1,183-1,733/tpa
 *
 * We adopt **$1,400/tpa at 1.2 Mt/yr** (mid-band). Two findings are STATED,
 * not tuned away:
 *  1. Subtracting the electrolyser island at the corridor's OWN 2024 basis
 *     ($2,300/kW, IEA GHR 2025) leaves a NEGATIVE residual (−$0.34bn). NEOM's
 *     $8.4bn cannot simultaneously contain 2.2 GW at 2024 ex-China prices and
 *     a synthesis complex. NEOM procured earlier and at scale; the gap is a
 *     real vintage/scale/supply-route difference, not an arithmetic error.
 *     Do not reconcile it by lowering the electrolyser basis — that number is
 *     independently sourced for a 2024 corridor-scale project.
 *  2. A corridor plant (~60 kt/yr) is ~20× below this reference scale. The
 *     six-tenths rule is being extrapolated well past its comfortable range;
 *     `synthesizePlant` flags any extrapolation beyond 5×.
 */
const SCALE_NOTE =
  "Scale reference 1.2 Mt/yr (NEOM), exponent 0.6 (six-tenths rule; applies to SYNTHESIS PLANT CAPITAL only - electrolysers/renewables are ~linear in capacity and already carried by the LCOH engine).";

const NEOM_NOTE =
  "Anchored to NEOM Green Hydrogen (FID May 2023, $8.4bn / 1.2 Mt NH3/yr), net of the electrolyser island and dedicated renewables which the LCOH engine prices separately - see the decomposition in ref/synthesis.ts. Unverified planning benchmark; replace via SynthesisConfig or a future reference bundle. "
  + SCALE_NOTE;

export const SYNTHESIS_BENCHMARKS: readonly SynthesisBenchmark[] = [
  {
    carrierId: "e-ammonia",
    tH2PerTonne: 0.178,
    co2TPerTonne: 0,
    electricityMwhPerTonne: 0.35, // ASU + synthesis loop
    plantCapexUsdPerTpa: 1400,
    referenceScaleTonnesPerYear: 1_200_000,
    scaleExponent: 0.6,
    plantOpexFracPerYear: 0.03,
    plantLifeYears: 25,
    shippingUsdPerTonneKm: 0.012,
    inlandUsdPerTonneKm: 0.12,
    verified: false,
    sourceNote: NEOM_NOTE,
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
    inlandUsdPerTonneKm: 0.12,
    verified: false,
    sourceNote:
      "Planning-level MeOH-synthesis magnitude (unverified) - NOT yet anchored to a named project, unlike e-ammonia. "
      + SCALE_NOTE,
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
    inlandUsdPerTonneKm: 0.20, // cryogenic road/pipe haulage carries a premium
    verified: false,
    sourceNote:
      "Planning-level liquefier magnitude (unverified) - NOT yet anchored to a named project, unlike e-ammonia. "
      + SCALE_NOTE,
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
