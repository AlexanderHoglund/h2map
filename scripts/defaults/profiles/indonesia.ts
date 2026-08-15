/**
 * Indonesia — the first enriched country profile.
 *
 * Every value carries its source, retrieval date and a verified flag.
 * `verified: false` means "usable but unconfirmed" and the UI shows it as
 * unverified; a value nobody could source is simply ABSENT, so the model
 * falls back to its own default rather than being handed a guess dressed
 * as research.
 *
 * Three judgement calls worth stating, because each could have gone the
 * other way and quietly moved an LCOH:
 *
 * 1. WACC 9.4 %, not IRENA's 6.0 %. The IRENA figure carries a 2023
 *    publication date and an authoritative brand, but its own appendix
 *    sources it to *Renewable Power Generation Costs in 2021* and it is a
 *    REAL after-tax number. Pairing a 2021 real WACC with present-day
 *    nominal CAPEX understates cost badly. The IEA's 2024 Cost of Capital
 *    Observatory survey gives 9.4 % nominal for Indonesian solar PV, which
 *    is the like-for-like figure.
 * 2. Land cost is ABSENT. The one published number (Colliers, USD 180/m²)
 *    is Greater Jakarta — the most supply-constrained industrial market in
 *    the country. A hydrogen project sited for resource quality sits in
 *    Sulawesi, Aceh or NTT, where land is dramatically cheaper and no
 *    defensible figure was found. Applying the Jakarta number would
 *    overstate land capex by roughly an order of magnitude.
 * 3. No carbon price. Indonesia's carbon tax is legislated at ~$2/t but
 *    NOT in force, and IDXCarbon traded about $73k in six months. A price
 *    that thin cannot support hydrogen revenue, so the profile carries
 *    none rather than letting a notional credit close a cost gap.
 */

export interface ProfileField {
  value: number;
  source: string;
  retrievedAt: string;
  verified: boolean;
  note?: string;
}

export interface CountryProfile {
  iso2: string;
  profileVersion: string;
  /** Replaces the ingest's automated string on a curated row. */
  source: string;
  fields: {
    wacc_curated?: ProfileField;
    country_risk_premium?: ProfileField;
    electricity_price_usd_mwh?: ProfileField;
    water_price_usd_m3?: ProfileField;
    land_cost_usd_ha?: ProfileField;
    labour_index?: ProfileField;
  };
  capexPack?: Record<string, number> | null;
}

export const INDONESIA: CountryProfile = {
  iso2: "ID",
  profileVersion: "2026-08-15",
  source:
    "Researched country profile 2026-08-15 — per-field citations in profile_source",
  fields: {
    wacc_curated: {
      value: 0.094,
      source:
        "IEA Cost of Capital Observatory 2024 survey (median nominal post-tax WACC, utility-scale solar PV, Indonesia), via IEA commentary 'High cost of capital and limited project pipeline hinder clean energy investment in Southeast Asia'",
      retrievedAt: "2026-08-15",
      verified: true,
      note:
        "Nominal, local currency. Indonesian RE project finance is largely USD-denominated, so a USD nominal WACC is close but not identical; a defensible range is 8.5-10.5%. Moody's (Feb 2026) and Fitch (Mar 2026) both moved Indonesia to a NEGATIVE outlook, which argues for the upper end in a stress case. Deliberately NOT IRENA's 6.0%, which is a 2021 real value.",
    },
    country_risk_premium: {
      value: 0.0246,
      source:
        "Damodaran (NYU Stern), country risk premia, 5 January 2026 update — Moody's Baa2, adjusted default spread 1.62%, CRP 2.46%, total ERP 6.69%",
      retrievedAt: "2026-08-15",
      verified: true,
      note:
        "Stale in the adverse direction: two of three agencies cut Indonesia to a negative outlook AFTER this snapshot.",
    },
    electricity_price_usd_mwh: {
      value: 62.9,
      source:
        "PLN tariff I-3 (medium voltage, >200 kVA) 1,122 IDR/kWh, Q3 2026 (1 Jul-30 Sep, held flat by government decision under ESDM Reg. 7/2024), converted at Bank Indonesia JISDOR 17,836 IDR/USD (14 Aug 2026)",
      retrievedAt: "2026-08-15",
      verified: false,
      note:
        "Unverified only because PLN's own tariff page was unreachable; the value is consistent across independent Indonesian outlets. I-4 (>=30,000 kVA) is 997 IDR/kWh = $55.9/MWh. Note renewable PPAs price BELOW retail industrial power (PR 112/2022 solar ceiling 5.63 US cents/kWh = $56.3/MWh), which is the interesting fact for a captive-RE project. The exchange rate matters: the ESDM formula window used 16,959, giving $66.2/MWh.",
    },
    water_price_usd_m3: {
      value: 1.21,
      source:
        "PAM Jaya (Jakarta) industrial tariff K3, large industry >20 m3 block: 21,500 IDR/m3 under Kepgub DKI Jakarta 730/2024, converted at JISDOR 17,836 (14 Aug 2026)",
      retrievedAt: "2026-08-15",
      verified: false,
      note:
        "Jakarta-anchored. PDAM tariffs are set per region and vary widely, and a coastal hydrogen site would likely desalinate ($0.50-1.50/m3) instead. Second-order for LCOH: ~9 kg water per kg H2 is about $0.01/kg at $1/m3.",
    },
    // land_cost_usd_ha: ABSENT. The only published figure is Greater
    // Jakarta (Colliers Q2 2026, USD 180.33/m2 = $1.80m/ha), which is the
    // wrong geography for a resource-sited project by an order of
    // magnitude. No defensible figure for Sulawesi/Aceh/NTT was found.
    // labour_index: ABSENT. No construction-labour cost index relative to
    // OECD could be sourced.
  },
  capexPack: null,
};
