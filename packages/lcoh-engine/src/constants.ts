import type { LCOHInputs } from "./types";

/** Lower heating value of hydrogen, kWh per kg (source doc, §2). */
export const LHV_H2_KWH_PER_KG = 33.33;

/** Hours in the engine's representative (non-leap) year. Profiles must have exactly this length. */
export const HOURS_PER_YEAR = 8760;

/** Desalination electricity, kWh per m³ of water — counted in the emissions ledger only, never in cost. */
export const DESAL_KWH_PER_M3 = 3.75;

/** Pumping electricity, kWh per m³ per 100 m of lift — emissions ledger only. */
export const PUMP_KWH_PER_M3_PER_100M = 0.4;

/**
 * Water per kg H₂, litres — the **stoichiometric floor**, not plant demand.
 *
 * 9 L/kg is what the electrolysis reaction itself consumes: the theoretical
 * minimum, and the number the source methodology specifies. A real plant
 * needs MORE — purification rejects a fraction of the feed and cooling
 * consumes more still — so published total consumption runs 15-25 L/kg, and
 * RMI puts it at 20-30 L/kg. Treat this as a lower bound, roughly a half to
 * a third of what a site actually withdraws.
 *
 * Deliberately NOT scaled up by a plant factor, for two reasons. The cost
 * consequence is negligible — at the enriched Indonesian water price of
 * 1.21 USD/m³ the difference between 9 and 30 L/kg is 0.011 vs 0.036
 * USD/kg, against an LCOH of several dollars — and the value is pinned by
 * six hand-computed golden fixtures whose water figures are authoritative.
 * Changing it is a sign-off decision, not a silent constant edit.
 *
 * Where it DOES matter is volume: `totals.waterM3` and the desalination
 * electricity in the emissions ledger both scale linearly with this, so
 * both are floors too. For water-scarce siting — where the withdrawal
 * volume is the headline figure, not the cost — multiply by 2-3× before
 * comparing against a local water budget.
 */
export const WATER_L_PER_KG_H2 = 9;

export const DAYS_PER_MONTH = [
  31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
] as const;

/**
 * Electrolyser supply route (reference data, NOT a user input). IEA GHR 2025
 * reports installed system CAPEX that differs by where the unit is made and
 * where it is installed; naming the route is what makes the number
 * defensible, and it gives a future regional cost index somewhere to live.
 *
 * Source: IEA, Global Hydrogen Review 2025, executive summary — electrolyser
 * made and installed outside China, 2024: USD 2,000–2,600/kW; a Chinese unit
 * installed outside China 1,500–2,400; made and installed in China 600–1,200.
 * Values below are the midpoints.
 */
export const ELECTROLYZER_SUPPLY_ROUTES = Object.freeze({
  "ex-china": 2300,
  "china-installed-abroad": 1950,
  "china-domestic": 900,
} as const);

/** The route the reference defaults use. */
export const DEFAULT_SUPPLY_ROUTE = "ex-china" as const;

/**
 * Default parameter set. Physical/process parameters follow the source
 * methodology's input table ("Motor de Cálculo LCOH", April 2024); the
 * electrolyser COST parameters were re-based to IEA GHR 2025 (2024 vintage)
 * in the 2026-08-02 realism pass — see docs/COST_YEARS.md and
 * docs/ENGINE_NOTES.md. The grid emission factor has no global default in the
 * doc ("region default") — 0.4 tCO₂/MWh is a placeholder near the world
 * average; callers should override per country.
 *
 * Electrolyser cost basis (all four move together — do not change one alone):
 *
 * - `capexUsdPerKw` 2300 — IEA GHR 2025 midpoint for an electrolyser made and
 *   installed outside China, 2024 (range 2,000–2,600). Per the Assumptions
 *   Annex this covers the electrolyser system, electric equipment, gas
 *   treatment, plant balancing AND EPC — more than half the total is EPC and
 *   contingency, and it is location-dependent. Power generation assets are
 *   EXCLUDED (they are priced separately as pv/wind/grid).
 *   ⚠ Because EPC and contingency are already inside this figure, callers must
 *   NOT apply a further owner's-cost or contingency multiplier to the
 *   electrolyser island — that double-counts.
 * - `opexFractionPerYear` 0.0130 — retuned from 0.03 so that ABSOLUTE fixed
 *   O&M is unchanged at ~USD 30/kW/yr (0.03 × 1000 = 0.0130 × 2300). OPEX is a
 *   fraction OF capex here (see simulate.ts), so leaving it at 0.03 would have
 *   silently multiplied annual O&M by 2.3× on the back of a CAPEX citation
 *   that says nothing about O&M.
 * - `stackReplacementCostFraction` 0.13 — retuned on the same principle: holds
 *   the replacement event at ~USD 300/kW. Independently corroborated: a stack
 *   is ~40–50% of installed system cost and a replacement ~30% of stack →
 *   12–15% of system cost, which brackets 13%.
 * - `stackLifetimeHours` 50_000 — IEA GHR 2025 gives 50,000 h as the economic
 *   optimum (up to 95,000 h technically achievable).
 */
export const REFERENCE_DEFAULTS: LCOHInputs = Object.freeze<LCOHInputs>({
  // discountRate is REAL (see LCOHInputs.finance.discountRate): the engine
  // discounts constant-USD cashflows with no escalation term. 8% real is the
  // source methodology's resource-ranking rate — a deliberately neutral
  // figure held constant across cells so the map compares RESOURCE, not
  // country risk. Because it is uniform it barely affects ordering, but the
  // basis is stated because a rate without one is how the nominal/real bug
  // enters (see scripts/defaults/discountBasis.ts).
  finance: { lifetimeYears: 20, discountRate: 0.08 },
  electrolyzer: {
    capacityMw: 100,
    capexUsdPerKw: ELECTROLYZER_SUPPLY_ROUTES[DEFAULT_SUPPLY_ROUTE],
    opexFractionPerYear: 0.013,
    efficiencyLhv: 0.6,
    degradationPerYear: 0.01,
    stackLifetimeHours: 50_000,
    stackReplacementCostFraction: 0.13,
  },
  pv: { capacityMw: 100, pricing: { mode: "lcoe", usdPerMwh: 30 } },
  wind: { capacityMw: 100, pricing: { mode: "lcoe", usdPerMwh: 30 } },
  grid: { maxImportMw: 100, priceUsdPerMwh: 30, emissionFactorTco2PerMwh: 0.4 },
  water: {
    priceUsdPerM3: 0.5,
    transportUsdPerM3Per100Km: 0.09,
    transportDistanceKm: 0,
    desalinated: false,
    pumpingHeadM: 0,
  },
});
