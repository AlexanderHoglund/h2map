/**
 * Publish 2026-08-21-verified-v5: the v4 catalogue with every benchmark
 * verified, pooled with a stated basis, or designated as a modelling choice.
 *
 * Bundles are IMMUTABLE — a change publishes a new id, never an edit. This
 * composes a NEW bundle from 2026-08-18-fuel-v4 plus the verification
 * research (docs/corridor/research/verification-apply-sheet-v5.md — the
 * researcher's apply sheet, 79 datapoints over 8 waves; the full log lives
 * with the researcher). Unlike the fuel/vessel re-bases, this touches
 * countries AND vessels AND fuels, so the byte-identical guard covers only
 * the sections verification never named: schedules, regulationDefaults,
 * constants, fuelEmissions, vesselTypeAliases.
 *
 * THE THREE §0 DECISIONS, RESOLVED AGAINST THE ENGINE:
 *
 * 1. WACC basis. The researched values are real post-tax USD; the engine
 *    discounts NOMINAL cash flows by default (rateBasis defaults "nominal"
 *    and gates only OPEX escalation — rates.ts/side.ts). Every country WACC
 *    ships +2.30pp (FRED T10YIE breakeven, the build's own instrument).
 * 2. Vessel capex spec. resolve.ts multiplies (1 + vesselCapexPremium) on
 *    the green side, so the row capex is the CONVENTIONAL base — exactly
 *    what the B2 research priced. Values drop in unconverted.
 * 3. Production opex boundary. Build-plant charges nothing for fuel
 *    production outside prodCapex/prodOpex, so opex is the ONLY feedstock
 *    carrier: e-methanol ships the composed complete-scope band (renewables
 *    capitalized in capex per the e-ammonia precedent; opex = DEA 3% O&M
 *    + CO2 feedstock at 1.4 t/t × $30–100/t).
 *
 * VALUE CHANGES LAND IN PLACE under the new bundle id (the fuel-v4
 * precedent): ids never move, so stored scenarios re-cost on repin — the
 * documented meaning of a benchmark correction. Deprecated vessel rows are
 * carried untouched (retired classes are not re-verified).
 *
 * Port/cargo load replaces the old flat tier-C estimates with the researched
 * per-1000-GT family rates evaluated per row:
 *
 *   GJ/day = R_family × anchorK^0.3 × (GT/1000)^0.7
 *
 * (the Port Houston finding that the per-GT rate falls with size, n≈0.7,
 * normalised at the GT the sources measured). GT is estimated per row from
 * class typicals — vessel rows carry no GT — and the estimate is recorded in
 * provenance. The rate is ALL MACHINERY including cargo work, so
 * cargoSystemGjPerDay is folded to 0 where a row carried one. The LNG
 * carrier is the exception: measured 900 GJ/day burnt-at-berth (EU MRV),
 * explicitly NOT boil-off generated.
 *
 * Run: npx tsx scripts/corridor/build-verified-bundle.ts
 */

import { readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url);
const PREV_ID = "2026-08-18-fuel-v4";
const NEW_ID = "2026-08-21-verified-v5";
const SHEET = "docs/corridor/research/verification-apply-sheet-v5.md";

/** Real → nominal conversion applied to every country WACC (§0.1). */
const BREAKEVEN_PP = 0.023;

// ---------------------------------------------------------------------------
// Group A — country WACCs (real post-tax USD from the component build;
// shipped nominal = real + breakeven). SourceNotes are the log's §A6 strings
// plus the basis-conversion sentence.
// ---------------------------------------------------------------------------

const WACC_BUILD_NOTE =
  "Real post-tax USD WACC, component build: rf 2.19% (UST 10y less US default " +
  "spread less 10y breakeven, FRED DGS10/T10YIE/DFII10, Aug 2026) + levered " +
  "beta 1.55 x mature ERP 4.20% (Damodaran, 1 Jul 2026) + country risk " +
  "premium; 60% debt at rf + 175 bp, tonnage-tax effective rate 5%. " +
  "Cross-checked against IEA Cost of Capital Observatory merchant-risk ranges.";
const NOMINAL_NOTE =
  " Shipped NOMINAL (+2.30pp, FRED T10YIE 10y breakeven): the model " +
  "discounts inflation-escalated cash flows by default (rateBasis nominal).";

const COUNTRIES: Record<string, { real: number; crp: string; extra?: string }> = {
  denmark: { real: 0.057, crp: "CRP 0.00%" },
  netherlands: {
    real: 0.057,
    crp: "CRP 0.00%",
    extra:
      " ACM pilotage 7.2% nominal pre-tax EUR is a regulated-monopoly floor, not a comparator.",
  },
  singapore: {
    real: 0.057,
    crp: "CRP 0.00%",
    extra:
      " The previous +50bp over DK/NL was a currency artefact with no country-risk basis in a USD model.",
  },
  "united-states": { real: 0.06, crp: "CRP 0.23% (US special case: raw default spread)" },
  india: {
    real: 0.079,
    crp: "CRP 2.85%, sovereign default spread 1.87%; x-check IEA Observatory India 2024 solar 10.0-11.5% nominal INR",
  },
  brazil: {
    real: 0.082,
    crp: "CRP 3.24%, spread 2.13%; x-check IEA Observatory Brazil 2024 solar 11.5-12.5% nominal BRL; ANTAQ's regulated port WACC 9.92% BRL sat below the previously shipped 11.5%",
  },
  other: {
    real: 0.093,
    crp: "Ba3 notch on the Damodaran sovereign ladder (default spread 3.06%, CRP 4.66%), two notches below Brazil (Ba1) and floored above every listed country so unlisted jurisdictions are never flattered. Verified by method (ladder reconstructed from ctryprem country rows); conservative high side by design",
  },
};

// ---------------------------------------------------------------------------
// Group B2 — vessel capex, conventional USD m. Only the movers; every other
// row is an explicit keep in the apply sheet.
// ---------------------------------------------------------------------------

const CAPEX: Record<string, { value: number; prov: string }> = {
  "chem-imo2-25k": {
    value: 38,
    prov: "A: sized below the hard 50,000 dwt conventional print ($50.7m, HD Hyundai Mipo x8 for Hafnia, Apr-2026); shipped 50 equalled the 50k dwt price",
  },
  "chem-imo2-40k": {
    value: 46,
    prov: "A: 40,500 dwt chem/product LNG-DF $44.9m (Wuhu, Ardmore, Apr-2026) de-rated to conventional ~39; bounded by the 50k dwt $50.7m print",
  },
  "cont-ulcv-18000": {
    value: 180,
    prov: "B: 190,000 dwt ~18,000 TEU x4 LNG-DF $201.34m (Jiangnan, COSCO, Jan-2026) de-rated by the observed 1.22 DF premium; band 165-184; the shipped 215 was a dual-fuel price in a conventional field",
  },
  "cont-ulcv-24000": {
    value: 232,
    prov: "B: container contract curve (n=0.805); no 22-24,000 TEU price is public (MSC/Hengli undisclosed). Weakest container row",
  },
  "gas-vlgc-84k": {
    value: 117,
    prov: "A: eight independent 2025-26 prints, all $113-121m (BW LPG x8 $117.5m HD Hyundai HI Jun-2026; Aygaz $119.0m; HD Hyundai Samho $114.5-120.85m). Shipped 95 was 19% below every observation",
  },
  "roro-cargo-12k": {
    value: 88,
    prov: "A: Tasmanian Achiever II / Victorian Reliance II, 12,000 dwt exactly, A$86m each (~US$62m, CSC Jinling 2016, conventional) + Finneco I-III 17,377 dwt US$66.7m (2018), escalated on the 2016->2026 broker series (+53-65%). Band 85-95",
  },
  "ropax-8k": {
    value: 200,
    prov: "A: MV W.B. Yeats 7,859 dwt EUR 144m (FSG 2016, conventional) + P&O Pioneer 8,850 dwt EUR 130m (Guangzhou 2019, hybrid), escalated on the documented +37% 2018->2025 (Tasmanian Parliament) and Grimaldi's 2025 ~US$144m order. Band 175-230. CAUTION: price tracks lane-metres and GT, not dwt; yard region (+40-80% Europe), fuel spec and service profile dominate",
  },
  "genc-12k": {
    value: 19,
    prov: "B: general-cargo curve from $15.61m at 7,500 dwt (Garden Reach, Sep-2025) and $29.8m at 40,000 dwt open-hatch (Jiangmen Nanyang, Apr-2026)",
  },
};

/** Explicit keeps (provenance upgraded, value unchanged). */
const CAPEX_KEEP: Record<string, string> = {
  "bulk-postpanamax-93k":
    "A: bracketed by kamsarmax 82k $38.0m (four brokers, Aug-2026) and 87k dwt open-hatch $45.0m (COSCO HI Dalian, Oct-2025)",
  "bulk-vloc-325k":
    "A: 343,000 dwt ore carrier x6 at $121.3m (CMHI, CMES, Jul-2026), within 3% after size adjustment",
  "tank-small-15k":
    "B: tanker contract curve (n=0.488, residuals +/-6% over 50k-310k dwt) -> 29.2; bracketed by 9,000 dwt bitumen $28.4m and 6,800 dwt chemical $24.9m",
  "chem-imo2-12k":
    "B: chemical curve -> 29.5 (+8.6%); nearest print 6,800 dwt Korean stainless $24.9m",
  "cont-handy-2800":
    "A: broker 2,700-2,900 TEU $44.0m (Star Asia, 15 Aug-2026) + contract $46.5m (Nantong CIMC SOE, Euroseas, Apr-2026), 2.8% apart",
  "genc-25k": "B: general-cargo curve -> 24.8 (+12.7%, inside tolerance)",
};

// ---------------------------------------------------------------------------
// Group B3 — vessel opex, USD/day from audited fleet accounts; shipped as
// $m/yr (x365/1e6). Bulk, tanker and chemical rows keep their MMI FY2024
// basis (MMI covers exactly those segments).
// ---------------------------------------------------------------------------

const OPEX_PER_DAY: Record<string, { usdPerDay: number; prov: string }> = {
  "cont-feeder-1800": { usdPerDay: 7200, prov: "A: Costamare FY2025 $6,516/day + Global Ship Lease FY2025 $8,230/day (two audited fleets)" },
  "cont-handy-2800": { usdPerDay: 7200, prov: "A: Costamare FY2025 + Global Ship Lease FY2025" },
  "cont-subpanamax-5000": { usdPerDay: 7400, prov: "A: Costamare/GSL family anchor, size-shaped" },
  "cont-panamax-6400": { usdPerDay: 7600, prov: "A: Costamare/GSL family anchor, size-shaped" },
  "cont-8000": { usdPerDay: 7900, prov: "A: Costamare/GSL family anchor, size-shaped" },
  "cont-neopanamax-13640": { usdPerDay: 8400, prov: "A: Costamare/GSL family anchor, size-shaped toward the Seaspan/Atlas large-ship $8,908/day" },
  "cont-ulcv-18000": { usdPerDay: 8900, prov: "B: EXTRAPOLATED above 14,424 TEU - no listed owner discloses opex for larger ships; ceiling from Seaspan/Atlas H1-2025 $8,908/day ex-bareboat (fleet to 24,000 TEU)" },
  "cont-ulcv-24000": { usdPerDay: 8900, prov: "B: EXTRAPOLATED above 14,424 TEU - same basis as the 18,000 TEU row" },
  "gas-vlgc-84k": { usdPerDay: 9000, prov: "A: BW LPG FY2025 $8,800/day + Dorian LPG FY-Mar-2026 $10,557/day (~9,300 ex non-capitalisable drydock)" },
  "gas-lng-174k": { usdPerDay: 15000, prov: "B: Flex LNG FY2025 $15,780/day (13 ships, 174k cbm) - single clean source; CCEC cross-check contaminated by a boxship" },
  "vlac-93k": { usdPerDay: 9900, prov: "C: POOLED assumption - VLGC central +10%. No ammonia-carrier opex disclosure exists; the first VLACs are still delivering" },
  "pctc-7000ceu": { usdPerDay: 8400, prov: "A: Wallenius Wilhelmsen Q2-2026 $8,142/day + Hoegh Autoliners FY2025 derived $8,510/day, 4.5% apart" },
  "roro-cargo-12k": { usdPerDay: 8400, prov: "C: POOLED - PCTC analogy, stated; no listed ro-ro owner discloses per-day opex" },
  "ropax-8k": { usdPerDay: 25000, prov: "C: POOLED, band $11,000-42,000/day (Molslinjen 2024 ~EUR10,500; Tallink FY2025 ~EUR38,285; Washington State Ferries FY2024 US$29,257). The 4x spread is crew nationality and hotel staffing, not ship size" },
  "genc-12k": { usdPerDay: 3800, prov: "A: Wilson AS FY2025 EUR 2,863-3,379/day (131 short-sea general-cargo ships) + Pacific Basin FY2024 handysize US$4,750/day - two audited fleets bracketing" },
  "genc-25k": { usdPerDay: 4500, prov: "A: Wilson AS FY2025 + Pacific Basin FY2024, interpolated between the brackets" },
};

const OPEX_KEEP_PROV =
  "A: Moore Maritime Index 2025 (FY2024 audited accounts; MMI covers tankers and bulk carriers)";

// ---------------------------------------------------------------------------
// Group B1.3 — observed cruise-phase service speeds (kn). ICCT WP 2020-27
// Table 5 (AIS 2019) primary, IMO DCS RY2023 Table 3 cross-check. Rows the
// research did not name individually get the family/bin assignment, marked.
// ---------------------------------------------------------------------------

const SPEEDS: Record<string, { kn: number; prov: string }> = {
  "bulk-handysize-35k": { kn: 11.2, prov: "B: ICCT family bin assignment (row not individually researched)" },
  "bulk-handymax-58k": { kn: 11.2, prov: "B: ICCT family bin assignment" },
  "bulk-ultramax-64k": { kn: 11.2, prov: "B: ICCT family bin assignment" },
  "bulk-panamax-76k": { kn: 11.2, prov: "A: ICCT 60-100k dwt bin, observed cruise" },
  "bulk-kamsarmax-82k": { kn: 11.2, prov: "A: ICCT 60-100k dwt bin, observed cruise" },
  "bulk-postpanamax-93k": { kn: 11.2, prov: "A: ICCT 60-100k dwt observed 11.2 (DCS all-bulk 10.69)" },
  "bulk-capesize-180k": { kn: 11.3, prov: "A: ICCT 200k+ bin, observed cruise" },
  "bulk-newcastlemax-210k": { kn: 11.3, prov: "A: ICCT 200k+ bin, observed cruise" },
  "bulk-vloc-325k": { kn: 11.3, prov: "A: ICCT 200k+ dwt observed 11.3" },
  "tank-small-15k": { kn: 10.0, prov: "A: ICCT 10-20k dwt observed 10.0 (DCS 4-20k 10.40)" },
  "tank-mr1-40k": { kn: 11.2, prov: "A: ICCT 20-60k dwt observed 11.2" },
  "tank-mr2-50k": { kn: 11.2, prov: "A: ICCT 20-60k dwt observed 11.2 (DCS >=20k 11.05)" },
  "tank-lr1-75k": { kn: 11.1, prov: "B: IMO DCS RY2023 tanker >=20k mean (no ICCT row researched for this bin)" },
  "tank-lr2-115k": { kn: 11.1, prov: "B: IMO DCS RY2023 tanker >=20k mean" },
  "tank-suezmax-160k": { kn: 11.1, prov: "B: IMO DCS RY2023 tanker >=20k mean" },
  "tank-vlcc-300k": { kn: 11.1, prov: "B: IMO DCS RY2023 tanker >=20k mean" },
  "chem-imo2-12k": { kn: 10.0, prov: "B: oil-tanker proxy (no chemical-specific published speed exists)" },
  "chem-imo2-25k": { kn: 11.2, prov: "B: oil-tanker proxy" },
  "chem-imo2-40k": { kn: 11.2, prov: "B: oil-tanker proxy" },
  "cont-feeder-1800": { kn: 13.7, prov: "B: nearest researched bin (2,800 TEU observed 13.7)" },
  "cont-handy-2800": { kn: 13.7, prov: "A: ICCT observed cruise 13.7 (DCS 12.62)" },
  "cont-subpanamax-5000": { kn: 14.5, prov: "B: interpolated between the 2,800 (13.7) and 6,400 (15.3) TEU observed bins" },
  "cont-panamax-6400": { kn: 15.3, prov: "A: ICCT observed cruise 15.3" },
  "cont-8000": { kn: 15.3, prov: "B: nearest researched bin (6,400 TEU observed 15.3)" },
  "cont-neopanamax-13640": { kn: 15.8, prov: "A: ICCT observed cruise 15.8" },
  "cont-ulcv-18000": { kn: 15.1, prov: "A: ICCT observed cruise 15.1" },
  "cont-ulcv-24000": { kn: 15.7, prov: "A: ICCT observed cruise 15.7" },
  "gas-lng-174k": { kn: 13.9, prov: "A: IMO DCS RY2023 LNG >=10k dwt 13.91" },
  "gas-vlgc-84k": { kn: 13.7, prov: "A: IMO DCS RY2023 gas carrier >=10k dwt 13.68" },
  "vlac-93k": { kn: 13.7, prov: "B: gas-carrier fleet mean (DCS); no VLAC-specific data exists" },
  "pctc-7000ceu": { kn: 14.5, prov: "A: IMO DCS RY2023 vehicle carrier 14.49" },
  "roro-cargo-12k": { kn: 14.0, prov: "A: IMO DCS RY2023 ro-ro 14.01" },
  "ropax-8k": { kn: 15.7, prov: "C: POOLED - DCS ro-pax >=5,000 GT fleet mean; a short-sea 8k dwt ropax typically designs above 20 kn" },
  "genc-12k": { kn: 9.4, prov: "A: IMO DCS RY2023 general cargo 3-15k dwt 9.37" },
  "genc-25k": { kn: 10.9, prov: "A: IMO DCS RY2023 general cargo >=15k dwt 10.94" },
};

// ---------------------------------------------------------------------------
// Group B1.1 — port + cargo load. Researched per-1000-GT family rates (fuel
// energy input, all machinery, berth hours), evaluated per row with the
// observed size falloff (n=0.7) normalised at the GT the sources measured.
// GT is an estimate from class typicals; recorded in provenance.
// ---------------------------------------------------------------------------

const PORT_FAMILY: Record<
  string,
  { rate: number; anchorK: number; band: string; basis: string }
> = {
  bulk: { rate: 2.3, anchorK: 40, band: "2.0-2.5", basis: "VERIFIED: TNO 2.46 vs Port Houston 2.05, 17% apart" },
  tanker: { rate: 15, anchorK: 30, band: "7.7-19.8", basis: "POOLED: bimodal by call type (discharge runs cargo pumps, load does not); TNO 19.78, Houston 7.71-17.72" },
  chemical: { rate: 17, anchorK: 12, band: "15-18", basis: "VERIFIED: TNO 17.93 vs Port Houston 15.30" },
  container: { rate: 5, anchorK: 40, band: "3.4-6.5", basis: "VERIFIED: band is the reefer-load spread (CE Delft 2026 Table 5)" },
  gas: { rate: 6, anchorK: 45, band: "4.8-9.4", basis: "POOLED (LPG): thin - TNO 9.43 vs Houston 4.77" },
  pctc: { rate: 7, anchorK: 45, band: "4.1-9.9", basis: "VERIFIED: TNO 7.07; Houston 4.11 (PCTC) - 9.86 (ro-ro)" },
  roro: { rate: 7, anchorK: 45, band: "4.1-9.9", basis: "VERIFIED: TNO/Houston ro-ro family pair" },
  ropax: { rate: 7, anchorK: 45, band: "4.1-9.9", basis: "VERIFIED: ro-ro family rate applied (no ropax-specific row)" },
  gencargo: { rate: 7, anchorK: 8, band: "5.5-11.3", basis: "POOLED: TNO 5.53 vs Houston 11.28, 2x apart" },
};

/** Estimated GT (thousands) per row — class typicals; rows carry no GT. */
const GT_EST: Record<string, number> = {
  "bulk-handysize-35k": 19, "bulk-handymax-58k": 32, "bulk-ultramax-64k": 35,
  "bulk-panamax-76k": 42, "bulk-kamsarmax-82k": 45, "bulk-postpanamax-93k": 51,
  "bulk-capesize-180k": 93, "bulk-newcastlemax-210k": 108, "bulk-vloc-325k": 165,
  "tank-small-15k": 9, "tank-mr1-40k": 24, "tank-mr2-50k": 30, "tank-lr1-75k": 42,
  "tank-lr2-115k": 62, "tank-suezmax-160k": 82, "tank-vlcc-300k": 160,
  "chem-imo2-12k": 8.4, "chem-imo2-25k": 17, "chem-imo2-40k": 26,
  "cont-feeder-1800": 18, "cont-handy-2800": 28, "cont-subpanamax-5000": 50,
  "cont-panamax-6400": 64, "cont-8000": 80, "cont-neopanamax-13640": 140,
  "cont-ulcv-18000": 190, "cont-ulcv-24000": 232,
  "gas-vlgc-84k": 48, "vlac-93k": 54,
  "pctc-7000ceu": 68, "roro-cargo-12k": 30, "ropax-8k": 48,
  "genc-12k": 9, "genc-25k": 18,
};

/** The LNG carrier is measured directly and is NOT a per-GT rate. */
const LNG_PORT = {
  gjPerDay: 900,
  prov:
    "A: fuel BURNT at berth, not boil-off generated: EU MRV 2019 1,114 t CO2/ship/yr at berth " +
    "/ 2.750 tCO2/tLNG = 405 t LNG/yr = 19,687 GJ/yr over ~20 berth days, + 359 GJ measured " +
    "cargo-pump work per discharge call. Band 650-1,400 GJ/day (15-30 berth days/yr). BOG " +
    "generated is 3,200-5,700 GJ/day but loading calls return vapour ashore and 44% of the " +
    "fleet reliquefies; JRC: only 3.8% of an LNG carrier's annual CO2 occurs at berth",
};

// ---------------------------------------------------------------------------
// Group B1.2 — laden/ballast split (share of distance). Currently inert in
// the engine (round-trip arithmetic); updated as verified reference data.
// ---------------------------------------------------------------------------

const BALLAST_RATIO: Record<string, number> = {
  bulk: 0.55, tanker: 0.5, chemical: 0.8, container: 1.0, gas: 0.7,
  gencargo: 0.65, roro: 0.95, ropax: 0.95, pctc: 0.95,
};

const BALLAST_PROV: Record<string, string> = {
  bulk: "A: IMO MEPC 68/INF.24 Table 5 (UCL/AIS, distance basis) 0.50-0.60",
  tanker: "A: MEPC 68/INF.24 + Bimpikis et al. 2026 (234,795 voyages); band 0.42-0.60, conservative low-laden side",
  chemical: "A: MEPC 68/INF.24 Table 5: 0.784 (>=20k dwt)",
  container: "A: 1.00 - liner ships do not ballast; the fill gap is a separate ~0.70 utilisation term (Clean Cargo/SFC 2024), NOT this split",
  gas: "A: MEPC 68/INF.24 Table 5: 0.554-0.755",
  gencargo: "A: MEPC 68/INF.24 Table 5: 0.632 (>=10k dwt)",
  roro: "C: POOLED - no published figure exists; liner-service analogy",
  ropax: "C: POOLED - no published figure exists; liner-service analogy",
  pctc: "C: POOLED - no published figure exists; liner-service analogy",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

const portGjPerDay = (family: string, gtK: number): number => {
  const f = PORT_FAMILY[family];
  return r1(f.rate * Math.pow(f.anchorK, 0.3) * Math.pow(gtK, 0.7));
};

type Json = Record<string, unknown>;

const src = (
  title: string,
  publisher: string,
  year: number,
  locator: string,
  figureUsed: string,
  note: string,
  url = "",
): Json => ({ title, publisher, year, locator, url, figureUsed, note });

/** Every source list ends with the apply-sheet reference. */
const sheetRef = (section: string): Json =>
  src(
    "Benchmark verification apply sheet v5",
    "Thaduberg corridor research",
    2026,
    `${SHEET} — ${section}`,
    "return line as applied",
    "Two-independent-source standard; states VERIFIED / VERIFIED_BY_METHOD / POOLED / DESIGNATED per item.",
  );

const band = (low: number, central: number, high: number): Json => ({ low, central, high });

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function main(): void {
  const prev = JSON.parse(
    readFileSync(new URL(`data/corridor-ref/${PREV_ID}.json`, ROOT), "utf8"),
  ) as Json;

  // -- countries -----------------------------------------------------------
  const countries = (prev.countries as Json[]).map((c) => {
    const spec = COUNTRIES[c.id as string];
    if (!spec) throw new Error(`country "${String(c.id)}" not in the verification set`);
    return {
      ...c,
      // Real + breakeven, rounded to 3dp in integer space (0.079 + 0.023
      // is not representable exactly in floats).
      wacc: Math.round((spec.real + BREAKEVEN_PP) * 1000) / 1000,
      verified: true,
      sourceNote:
        `${WACC_BUILD_NOTE} ${spec.crp}.${spec.extra ?? ""}${NOMINAL_NOTE}` +
        ` See ${SHEET} Group A.`,
    };
  });

  // -- vessels -------------------------------------------------------------
  const vessels = (prev.vesselTypes as Json[]).map((v) => {
    if (v.deprecated) return v; // retired classes are not re-verified
    const id = v.id as string;
    const family = v.family as string;
    const prov = { ...((v.provenance as Json) ?? {}) };

    const next: Json = { ...v };

    // capex
    if (CAPEX[id]) {
      next.capexUsdM = CAPEX[id].value;
      prov.capex = CAPEX[id].prov;
    } else if (CAPEX_KEEP[id]) {
      prov.capex = CAPEX_KEEP[id];
    }

    // opex
    if (OPEX_PER_DAY[id]) {
      next.opexUsdMPerYear = r2((OPEX_PER_DAY[id].usdPerDay * 365) / 1e6);
      prov.opex = OPEX_PER_DAY[id].prov;
    } else {
      prov.opex = OPEX_KEEP_PROV;
    }

    // service speed (metadata: consumed only when a scenario types its own
    // cargo.serviceSpeedKn; an observed baseline makes that ratio coherent)
    if (SPEEDS[id]) {
      next.serviceSpeedKn = SPEEDS[id].kn;
      prov.serviceSpeed = `${SPEEDS[id].prov} (observed cruise-phase baseline; the model consumes gjPerNm directly)`;
    }

    // port + cargo load
    if (id === "gas-lng-174k") {
      next.portGjPerDay = LNG_PORT.gjPerDay;
      next.cargoSystemGjPerDay = 0;
      prov.portAndCargoLoad = LNG_PORT.prov;
    } else if (GT_EST[id] && PORT_FAMILY[family]) {
      const f = PORT_FAMILY[family];
      next.portGjPerDay = portGjPerDay(family, GT_EST[id]);
      if ((v.cargoSystemGjPerDay as number) !== undefined) next.cargoSystemGjPerDay = 0;
      prov.portAndCargoLoad =
        `${f.basis}. Rate ${f.rate} GJ/day per 1,000 GT (band ${f.band}), all machinery ` +
        `incl. cargo work (cargoSystemGjPerDay folded to 0), evaluated at estimated ` +
        `${GT_EST[id]}k GT via rate x ${f.anchorK}^0.3 x (GT/1000)^0.7 — the Port Houston ` +
        `size falloff normalised at the measured fleet. Sources: Hulskotte/TNO Table 3.1 + ` +
        `Port Houston 2023 GMEI 3.11/3.12 (CARB 2025 OGV Tables 9/10 corroborate)`;
    }

    prov.ladenBallastSplit =
      `${BALLAST_PROV[family]}. Value ${BALLAST_RATIO[family]} (share of DISTANCE). ` +
      `Inert in the engine (round-trip arithmetic); do not also apply to a GLEC/IMO ` +
      `round-trip default intensity — that double-counts ballast`;

    next.provenance = prov;
    next.verified = true;
    next.sourceNote =
      `${v.sourceNote as string}; v5: verified against ${SHEET} (waves 2, 4, 8)`;
    return next;
  });

  // -- fuels ---------------------------------------------------------------
  const fuels = (prev.fuels as Json[]).map((f) => {
    const id = f.id as string;
    const research = JSON.parse(JSON.stringify(f.research ?? {})) as Json;
    const P = research.production as Json | undefined;
    const S = research.portStorage as Json | undefined;
    const B = research.bunkering as Json | undefined;
    const M = research.merchantPrice as Json | undefined;
    const V = research.vesselCapexPremium as Json | undefined;
    const pushSrc = (block: Json | undefined, ...entries: Json[]) => {
      if (!block) return;
      block.sources = [...((block.sources as Json[]) ?? []), ...entries];
    };
    const verify = (block: Json | undefined, ...entries: Json[]) => {
      if (!block) return;
      block.verified = true;
      pushSrc(block, ...entries);
    };

    const designation = (what: string) =>
      src(
        "Modelling designation: incumbent infrastructure",
        "Thaduberg corridor model",
        2026,
        `${SHEET} Group C`,
        "0/0/0 by designation",
        `Zero by designation, not by measurement: ${what} This is a modelling boundary, not a claim that the infrastructure is free.`,
      );

    switch (id) {
      case "lsfo": {
        const what =
          "LSFO uses incumbent refining, storage and bunkering infrastructure that is already built, sunk and shared across the existing fleet; the model charges no incremental infrastructure capex or opex for it.";
        verify(P, designation(what), sheetRef("Group C, lsfo"));
        verify(S, designation(what));
        verify(B, designation(what));
        break;
      }
      case "biodiesel-hvo": {
        const what =
          "HVO is a drop-in liquid fuel handled in existing distillate tankage and bunkering equipment, so no incremental port infrastructure is charged (production capex is charged separately).";
        verify(S, designation(what), sheetRef("Group C, biodiesel-hvo"));
        verify(B, designation(what));
        break;
      }
      case "lng": {
        verify(
          B,
          src(
            "CEF award LNGHIVE2 Algeciras + EG LNG Baltic + FueLNG Bellina",
            "European Commission CEF / FueLNG",
            2023,
            "grant decisions 2018-2023",
            "12,500 m3 / EUR 56.46m; 6,000 m3 / EUR 27.115m; 7,500 m3 / USD 37.6m",
            "Bunker vessels converge at EUR 4,500-5,000/m3 (first two points within EUR 2/m3); shore terminals EUR 2,000-2,700/m3 (Pori 30,000 m3 / EUR 81m; Tornio Manga 50,000 m3 / ~EUR 100m). The 40/55/90 band buys a ~9,000/12,000/20,000 m3 bunker vessel or a ~15,000/20,000/33,000 m3 shore tank - both ordinary sizes.",
          ),
          sheetRef("Group C, lng bunkering"),
        );
        if (B) B.opexUsdMPerYear = band(1.6, 2.2, 3.6);
        pushSrc(
          B,
          src(
            "Infrastructure opex convention: 4% of capex per year (band 2.7-5%)",
            "DEA / IEA / Lloyd's Register-UMAS / Trafigura (four independent sources)",
            2024,
            "DEA Technology Data CCTS co2-terminals note C; IEA Future of Hydrogen Assumptions Annex; LR/UMAS 2019 Table 8; Trafigura Pathways to LNG Imports",
            "3% / 4% / 3.0% / 2.7% of capex per year",
            "The shipped opex band implied 6.2-7.3%/yr; replaced with 4% of the capex band.",
          ),
        );
        verify(
          V,
          src(
            "SEA-LNG/Opsiana investment-case series + MMMCZCS conversion study",
            "SEA-LNG / MMMCZCS",
            2023,
            "three hull types with disclosed absolute premiums and tank volumes; Preparing Container Vessels for Conversion (2023)",
            "14,000 TEU +$11.68-15.37m (~10-14%); VLCC +$16.5-20.5m (~18-22%); Capesize +$9.0-11.5m (~18-23%); MMMCZCS methanol +11% / ammonia +16%",
            "Band kept 0.10/0.15/0.22 - strongly size-dependent: a container-only fleet sits at the bottom, a bulk/tanker fleet at the top.",
          ),
          sheetRef("Group C, lng vesselCapexPremium"),
        );
        break;
      }
      case "e-ammonia": {
        verify(
          B,
          src(
            "Ammonia: zero-carbon fertiliser, fuel and energy store",
            "The Royal Society",
            2020,
            "p. 23",
            "GBP 20-40m per 10,000 t refrigerated storage tank",
            "POOLED: the band brackets tank-farm-only cost for roughly 7-12 kt of ammonia. Scope EXCLUDES jetty, transfer arms, vapour return, safety systems and a bunker vessel; if bunkering includes those, the band is low.",
          ),
          sheetRef("Group C, e-ammonia bunkering"),
        );
        if (B) B.opexUsdMPerYear = band(0.8, 1.4, 2.2);
        pushSrc(
          B,
          src(
            "Infrastructure opex convention: 4% of capex per year",
            "DEA / IEA / LR-UMAS / Trafigura",
            2024,
            "see lng bunkering entry",
            "4%/yr on 20/34/55 $m",
            "The shipped 2/3/4.5 implied 8-10%/yr; no source publishes ammonia terminal opex, so the convention applies.",
          ),
        );
        break;
      }
      case "e-methanol": {
        if (P) {
          P.capexUsdPerTpa = band(3700, 5500, 9000);
          P.opexUsdPerTpaPerYear = band(155, 260, 410);
          P.scaleExponent = band(0.95, 0.89, 0.8);
          P.scopeIncluded = [
            "renewables",
            "electrolysis",
            "co2-conditioning",
            "methanol-synthesis",
            "site-infrastructure",
            "epc",
            "contingency",
          ];
          P.scopeExcluded = [
            "co2-capture-plant",
            "grid-connection-to-public-network",
            "land-acquisition",
            "working-capital",
            "financing-costs",
            "port-bunker-terminal",
          ];
        }
        verify(
          P,
          src(
            "Technology Data for Renewable Fuels, ch. 98 Methanol from hydrogen and carbon dioxide",
            "Danish Energy Agency",
            2024,
            "workbook ch. 98 + ch. 86; notes L and M",
            "0.31 MEUR/TPD (2020/2025); fixed O&M 3% of capex; variable O&M 0; inputs as physical quantities with no prices",
            "Capex rebuilt synthesis+electrolysis EUR 1,387-3,914/tpa by CF and vintage; anchors Hy2Market D4.8 ~EUR 5,130/tpa incl. dedicated renewables and C2X/Cepsa Huelva $1.1bn/300kt = $3,667/tpa. OPEX IS COMPOSED FOR THIS MODEL'S BOUNDARY: build-plant charges nothing for feedstock elsewhere, so opex = DEA 3%-of-capex O&M (111/165/270) + CO2 feedstock at 1.4 t/t x $30-100/t (44/95/140) = 155/260/410 $/tpa/yr, with dedicated renewables capitalized inside capex (electricity is a capital cost, as in the e-ammonia row). Scale exponent: DEA synthesis n=0.68-0.69, electrolysis modular n=0.80-0.97 (NETL 0.60-0.70 for CO2 removal corroborates the synthesis leg); a blended plant sits near 0.9 and the old 0.6 low end had no support.",
          ),
          sheetRef("Group C, e-methanol production"),
        );
        verify(
          S,
          src(
            "Ulsan New Port green-fuel storage expansion",
            "Ulsan Port Authority / Hyundai Oil Terminal (trade press)",
            2024,
            "KRW 300bn for 380,000 m3",
            "USD 219m / 380,000 m3 = $576/m3",
            "VERIFIED_BY_METHOD: the 6/12/22 $m band buys ~10,000/21,000/38,000 m3 at $576/m3 (generic atmospheric tank $100-300/m3 x chemical-service and scale factors lands in the same place). Declared volume makes the band checkable.",
          ),
          sheetRef("Group C, e-methanol portStorage"),
        );
        if (S) S.opexUsdMPerYear = band(0.24, 0.48, 0.88);
        verify(
          B,
          src(
            "CEF/AFIF award 24-ES-TG-LUXIA (Algeciras) and peers",
            "CINEA / European Commission",
            2024,
            "award lists: LUXIA EUR 55.2m; ZEBRA EUR 45.4m; Sines EUR 68.6m; EUR 47.2m",
            "methanol bunkering vessel + onshore loading, total eligible cost EUR 55,224,000 (no capacity published)",
            "POOLED: the 2/13/25 band is the SHORE-TRANSFER package only. LUXIA's vessel-plus-shore EUR 55.2m is the upper bound for a dedicated bunker vessel; LNG bunker vessels converge at EUR 4,500-5,000/m3 and a non-cryogenic methanol vessel sits below that.",
          ),
          sheetRef("Group C, e-methanol bunkering"),
        );
        if (B) B.opexUsdMPerYear = band(0.12, 0.52, 1.0);
        verify(
          M,
          src(
            "Innovation Outlook: Renewable Methanol + Economic Value of Methanol for Shipping",
            "IRENA / Methanol Institute",
            2024,
            "IRENA Tables 21/23/24 Fig. 39; MI 2024 willingness-to-pay analysis",
            "BECCS-CO2 800-1,600 $/t; DAC-CO2 1,200-2,400 $/t; EU WTP ceiling EUR 2,238-2,405/t to 2033",
            "Band re-scoped: low = biogenic/BECCS CO2 with cheap dedicated renewables, central = mixed sourcing, high = DAC CO2 (coincidentally the pre-2034 EU ceiling). FLAG: the EU willingness-to-pay ceiling steps down to ~EUR 1,325/t from 2034 when the RFNBO multiplier lapses - a stationary high band misrepresents the post-2033 world.",
          ),
          sheetRef("Group C, e-methanol merchantPrice"),
        );
        break;
      }
      case "lh2": {
        if (P) {
          P.capexUsdPerTpa = band(12000, 25000, 45000);
          P.scopeIncluded = ["electrolysis", "liquefaction"];
          P.scopeExcluded = [
            "dedicated-renewables",
            "export-terminal",
            "port-bunker-terminal",
          ];
        }
        verify(
          P,
          src(
            "DOE Hydrogen Program Record 19001 + Hydrogen Insights 2023",
            "US DOE / Hydrogen Council",
            2023,
            "Record 19001 (liquefier $50m at 6 tpd to $800m at 200 tpd, n=0.8); Insights Exhibit 5",
            "liquefaction $5,000-23,000/tpa; electrolysis $4,500-7,000/tpa",
            "Scope declared: electrolysis + liquefaction. The old 30,000/54,000/90,000 band had no stated scope and read 2-8x overstated against liquefaction alone.",
          ),
          sheetRef("Group C, lh2 production"),
        );
        verify(
          S,
          src(
            "DOE AMR 2024 project ST235 (Strategic Analysis) + IEA Future of Hydrogen Assumptions Annex",
            "US DOE / IEA",
            2024,
            "ST235 bulk LH2 tanks 5,000-100,000 m3; IEA export terminal $290m per 3,190 t",
            "$2,500-3,000/m3 (2020$) tanks; IEA ~$90,900/t incl. jetty and utilities",
            "VERIFIED_BY_METHOD with capacity declared: 175/270/400 $m buys ~5.0/6.4/9.4 kt LH2 on the DOE tank unit cost, or ~1.9/3.0/4.4 kt on the IEA terminal unit cost - the two published bases disagree ~2x because IEA includes jetty/loading/utilities. The band spans both.",
          ),
          sheetRef("Group C, lh2 portStorage"),
        );
        verify(
          B,
          src(
            "IEA Future of Hydrogen Assumptions Annex + DNV/Port of Oslo + Sandia SF-BREEZE",
            "IEA / DNV / Sandia",
            2025,
            "IEA terminal unit cost; DNV Safe Hydrogen Bunkering in the Port of Oslo (Mar 2025); Sandia shoreside $0.9-1.5m per 1,200 kg",
            "~$90,900/t terminal; truck-to-ship 7 t/vessel/week (no cost published)",
            "Scoped: 45/90/150 $m is a ~500/1,000/1,650 t LH2 terminal on the IEA unit cost. Nothing is published between Sandia's $1.5m truck-to-ship and IEA's $290m terminal tank - a real gap in the world, stated rather than hidden.",
          ),
          sheetRef("Group C, lh2 bunkering"),
        );
        if (B) B.opexUsdMPerYear = band(1.8, 3.6, 6.0);
        if (M) M.usdPerTonne = band(5500, 8500, 13000);
        verify(
          M,
          src(
            "Global Hydrogen Review 2024 + DOE Record 19001",
            "IEA / US DOE",
            2024,
            "GHR 2024 production cost ranges; Record 19001 liquefaction and terminal adders",
            "gaseous low-emissions H2 $2-9/kg; liquefaction $2.75/kg; terminal $0.39/kg",
            "Delivered LH2 ~$5.2-12.8/kg. The old low of 5,000 was internally inconsistent: $5/kg H2 plus $2.75/kg liquefaction cannot deliver at $5/kg.",
          ),
          sheetRef("Group C, lh2 merchantPrice"),
        );
        if (V) V.fraction = band(0.5, 0.8, 1.2);
        verify(
          V,
          src(
            "SEA-LNG VLCC tank cost + DOE ST235 + MMMCZCS Fuel Options Position Paper",
            "SEA-LNG / US DOE / MMMCZCS",
            2024,
            "marine LNG tanks $1,375/m3; bulk LH2 tanks $2,500-3,000/m3; Position Paper pp. 15, 52",
            "LH2 stores ~2.6x LNG volume per unit energy; tankage alone ~50-60% of a VLCC newbuild",
            "The flat 0.26 was contradicted, not merely unverified - MMMCZCS states hydrogen is 'irrelevant for deep sea shipping and is not further analyzed'. Bottom-up premium 0.50/0.80/1.20 before fuel cells, gas handling, boil-off management and lost cargo volume.",
          ),
          sheetRef("Group C, lh2 vesselCapexPremium"),
        );
        break;
      }
    }

    const next: Json = { ...f, research };
    // The flat premium scalar is what resolve.ts consumes; align it with the
    // verified central where the research moved it.
    if (id === "lh2") next.vesselCapexPremium = 0.8;
    return next;
  });

  // -- vesselDerivation (ballastRatio only) --------------------------------
  const vesselDerivation = JSON.parse(
    JSON.stringify(prev.vesselDerivation),
  ) as Json;
  vesselDerivation.ballastRatio = BALLAST_RATIO;

  // -- guards --------------------------------------------------------------
  const CARRIED = [
    "vesselTypeAliases",
    "benchmarkRules",
    "fuelEmissions",
    "constants",
    "schedules",
    "regulationDefaults",
    "schemaVersion",
  ] as const;

  const next: Json = {
    bundleId: NEW_ID,
    schemaVersion: prev.schemaVersion,
    source: {
      ...(prev.source as Json),
      note:
        "Verification release: every country, active vessel row and fuel research block is " +
        "verified, pooled with a stated basis, or designated as a modelling choice - see " +
        `${SHEET} (79 datapoints, waves 1-8). Country WACCs are researched real post-tax USD ` +
        "shipped NOMINAL (+2.30pp T10YIE breakeven) because the engine discounts " +
        "inflation-escalated cash flows by default. Vessel capex is CONVENTIONAL newbuild " +
        "(the green side multiplies 1 + vesselCapexPremium). benchmarkRules fossil zeros are " +
        "designations: the existing fleet and incumbent bunkering are sunk capital - correct " +
        "only while the comparison is incremental; a greenfield fossil fleet uses " +
        "flags.fossilFleetBasis = newbuild. Deprecated vessel rows are carried untouched and " +
        "remain unverified (retired classes). Every non-verified-in-place section is copied " +
        `byte-identical from ${PREV_ID}. Reference data is immutable: any change is a NEW ` +
        "bundle id, never an edit.",
    },
    vesselTypes: vessels,
    vesselTypeAliases: prev.vesselTypeAliases,
    vesselDerivation,
    fuels,
    countries,
    benchmarkRules: prev.benchmarkRules,
    fuelEmissions: prev.fuelEmissions,
    constants: prev.constants,
    schedules: prev.schedules,
    regulationDefaults: prev.regulationDefaults,
  };

  for (const key of CARRIED) {
    if (JSON.stringify(next[key]) !== JSON.stringify(prev[key])) {
      throw new Error(`carried section "${key}" is not byte-identical`);
    }
  }
  // vesselDerivation: everything except ballastRatio must be identical.
  const stripBallast = (d: unknown) => {
    const c = JSON.parse(JSON.stringify(d)) as Json;
    delete c.ballastRatio;
    return JSON.stringify(c);
  };
  if (stripBallast(next.vesselDerivation) !== stripBallast(prev.vesselDerivation)) {
    throw new Error("vesselDerivation changed beyond ballastRatio");
  }

  const out = new URL(`data/corridor-ref/${NEW_ID}.json`, ROOT);
  writeFileSync(out, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`wrote ${out.pathname}`);
  console.log(
    `countries: ${countries.length} verified; vessels: ${
      vessels.filter((v) => !v.deprecated).length
    } active verified; fuels: ${fuels.length}`,
  );
}

main();
