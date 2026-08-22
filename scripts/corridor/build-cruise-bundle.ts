/**
 * Publish 2026-08-21-cruise-v6: the verified v5 catalogue plus six ocean
 * cruise archetypes (research waves C1-C5, see
 * docs/corridor/research/cruise-research-v6.md).
 *
 * Bundles are IMMUTABLE — a change publishes a new id, never an edit. Every
 * existing row and section is copied byte-identical from v5 and asserted so
 * (vesselDerivation tolerates exactly one change: the `cruise: 1.0`
 * ballast-ratio designation). The six new rows are APPENDED.
 *
 * The cruise rows use the 3-term energy construction the research's MRV
 * closure test demands: `gjPerNm` is PROPULSION-ONLY, `hotelLoadGjPerDay`
 * carries hotel services for all 365 days (speed-independent, added by
 * resolve.ts outside the v² factor), and `portGjPerDay` is 0 because berth
 * hotel load lives inside the hotel term. Capex/opex were researched per
 * GROSS TON ($/GT near-flat across the ladder; technical opex $195/GT/yr
 * across three filers ±10%); hotelOpexUsdMPerYear is data-only by
 * designation (fuel-invariant, cancels in the gap).
 *
 * Run: npx tsx scripts/corridor/build-cruise-bundle.ts
 */

import { readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url);
const PREV_ID = "2026-08-21-verified-v5";
const NEW_ID = "2026-08-21-cruise-v6";
const RESEARCH = "docs/corridor/research/cruise-research-v6.md";

type Json = Record<string, unknown>;

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Vessel opex arrives as USD/day from audited fleet accounts. */
const perDayToUsdMPerYear = (usdPerDay: number) => r2((usdPerDay * 365) / 1e6);

const LADEN_BALLAST_NOTE =
  "C: DESIGNATED 1.0 - passenger vessels do not sail in ballast; the laden/ballast structure does not apply. A modelling designation, not a measurement";
const SHORE_POWER_NOTE =
  "AFIR (Reg. (EU) 2023/1804 Art. 9) mandates shore power for passenger ships >=5,000 GT at TEN-T core ports from 1 Jan 2030; FuelEU Maritime (Reg. (EU) 2023/1805 Art. 6) mandates connecting from 2030 (all EU OPS ports 2035). Together they remove most European at-berth fuel demand - 7-20% of these rows' annual energy. DOCUMENTED, NOT MODELLED: scenarios reaching past 2030 should not silently assume 2019 at-berth behaviour";
const ENERGY_PROV =
  "A: per-ship EU MRV 2018-2025 (15 ships; portal mirrored unmodified, validated against ICCT's published 317 gCO2/pax-nm for Anthem of the Seas). gjPerNm is PROPULSION-ONLY; hotel load derived from six ships' at-berth fuel power (9.77 GJ/day per 1,000 GT, range 7.37-14.85, reproducing Lloyd's Register's 5-10 MW), cruise aux/boiler split 83/17 (not the 68/32 all-ship average). Closure test (MSC World Europa 2025): 3-term exact at base; a folded 2-term is -20% under slow steaming";
const OPEX_PROV_GT =
  "A: technical opex $195/GT/yr - Carnival $205, RCL $191, NCLH $186 per GT/yr from FY2025 filings (+-10% on a denominator none of them uses). Hotel/technical split assumptions: marine crew 15% of shipboard payroll, technical 50% of other-operating";

interface CruiseRow {
  id: string;
  label: string;
  grossTonnage: number;
  lowerBerths: number;
  maxPax: number;
  crew: number;
  cabins: number;
  installedMw: number;
  serviceSpeedKn: number;
  capexUsdM: number;
  vesselOpexUsdPerDay: number;
  hotelOpexUsdPerDay: number;
  hotelLoadGjPerDay: number;
  gjPerNm: number;
  capexProv: string;
  opexProv: string;
}

const CRUISE: CruiseRow[] = [
  {
    id: "cruise-expedition-190",
    label: "Expedition cruise 190 berths (12,000 GT, PC6)",
    grossTonnage: 12_000, lowerBerths: 190, maxPax: 265, crew: 140, cabins: 95,
    installedMw: 6.5, serviceSpeedKn: 15.0, capexUsdM: 130,
    vesselOpexUsdPerDay: 30_100, hotelOpexUsdPerDay: 173_500,
    hotelLoadGjPerDay: 117, gjPerNm: 3.59,
    capexProv:
      "A: the strongest capex evidence in the catalogue - Lindblad filed the actual Ulstein shipbuilding contracts as SEC exhibits: NG Endurance NOK 1,066,000,000 ($134.6m), NG Resolution NOK 1,290,950,000 ($153.5m); cross-checked against Ultramarine EUR 106m / 199 berths (PC6, Brodosplit). PC6 series-built ~190 berths lands $110-155m",
    opexProv:
      "C: POOLED, single source - Lindblad is the only per-passenger-day expedition operating cost published by any filer ($1,067.72/ALBD ex-fuel; 96.5-berth ship $103,044/day). Hurtigruten Expedition Cruises AS statutory accounts would give the missing second source. Expedition is a ship-cost business: passenger-scaling share 13% vs ~50% for the big filers",
  },
  {
    id: "cruise-luxury-780",
    label: "Luxury cruise 780 berths (55,000 GT)",
    grossTonnage: 55_000, lowerBerths: 780, maxPax: 830, crew: 540, cabins: 410,
    installedMw: 28, serviceSpeedKn: 18.5, capexUsdM: 540,
    vesselOpexUsdPerDay: 29_400, hotelOpexUsdPerDay: 165_600,
    hotelLoadGjPerDay: 537, gjPerNm: 6.92,
    capexProv:
      "A: four independent ships at 54,300-55,500 GT - Silver Ray D80 $634m, Seven Seas Splendor $536m, Grandeur $517m, Viking programme $463m avg; median $9,700/GT. D80 caveat: contract price backed out of a disclosed ECA loan / 0.80 (convention documented in NCLH 10-K, Viking 20-F, RCL 2017)",
    opexProv: OPEX_PROV_GT,
  },
  {
    id: "cruise-premium-2400",
    label: "Premium cruise 2,400 berths (95,000 GT)",
    grossTonnage: 95_000, lowerBerths: 2_400, maxPax: 2_850, crew: 1_010, cabins: 1_205,
    installedMw: 50, serviceSpeedKn: 18.0, capexUsdM: 870,
    vesselOpexUsdPerDay: 50_800, hotelOpexUsdPerDay: 297_200,
    hotelLoadGjPerDay: 928, gjPerNm: 8.75,
    capexProv:
      "C: POOLED - the weakest cruise capex row: no premium-class newbuild price is disclosed by anyone (Koningsdam undisclosed by Carnival and Fincantieri; only aggregator figures exist, and aggregators run 3.5x errors - CruiseMapper's Silver Nova EUR 180m vs the audited $507m ECA loan on its sister). Band $700-1,000m from the orderbook $/GT. NOTE: the expected 45-55 GT/berth premium archetype does not exist in the fleet - modern premium converged on 37-38 GT/berth",
    opexProv: OPEX_PROV_GT,
  },
  {
    id: "cruise-contemporary-3100",
    label: "Contemporary cruise 3,100 berths (143,500 GT)",
    grossTonnage: 143_500, lowerBerths: 3_100, maxPax: 3_950, crew: 1_500, cabins: 1_630,
    installedMw: 56, serviceSpeedKn: 20.0, capexUsdM: 1_200,
    vesselOpexUsdPerDay: 76_700, hotelOpexUsdPerDay: 320_100,
    hotelLoadGjPerDay: 1_402, gjPerNm: 10.45,
    capexProv:
      "A: Norwegian Prima $850m (2022 contract); Celebrity Xcel D80 $1,500m (delivered Nov 2025); Disney Treasure $1,100m (10-K borrowing). Band $1,050-1,500m. Orderbook escalation is real: $/berth +44% 2019->Feb 2026 (~5.4%/yr), Meyer Werft state rescue Sep 2024 documents the mechanism",
    opexProv: OPEX_PROV_GT,
  },
  {
    id: "cruise-large-4300",
    label: "Large cruise 4,300 berths (178,000 GT)",
    grossTonnage: 178_000, lowerBerths: 4_300, maxPax: 5_100, crew: 1_735, cabins: 2_157,
    installedMw: 68, serviceSpeedKn: 19.0, capexUsdM: 1_600,
    vesselOpexUsdPerDay: 95_100, hotelOpexUsdPerDay: 429_500,
    hotelLoadGjPerDay: 1_739, gjPerNm: 11.46,
    capexProv:
      "A: Mardi Gras $1,350m (2020) escalated on the documented orderbook series; orderbook $8,689/GT (Feb 2026); Princess 3-ship floor. Band $1,350-1,900m. The class is bimodal (Carnival Excel 34 GT/berth vs RCL/Princess/NCL 40-44); this row sits on the RCL side",
    opexProv: OPEX_PROV_GT,
  },
  {
    id: "cruise-mega-5610",
    label: "Mega cruise 5,610 berths (237,000 GT)",
    grossTonnage: 237_000, lowerBerths: 5_610, maxPax: 7_000, crew: 2_300, cabins: 2_805,
    installedMw: 89, serviceSpeedKn: 20.5, capexUsdM: 2_100,
    vesselOpexUsdPerDay: 126_600, hotelOpexUsdPerDay: 546_600,
    hotelLoadGjPerDay: 2_315, gjPerNm: 12.96,
    capexProv:
      "A: Icon of the Seas $2,000m / 248,663 GT; Legend D80 $2,000m; orderbook $8,689/GT; Icon-4 ECA-derived ~$3,000m as upper bound (that facility may include non-yard costs, +10-15% possible overstatement). Band $1,900-2,600m. NOTE: 6,000 lower berths does not exist on any ship in service or on order - ceiling is 5,734; past ~5,700 what grows is MAX passengers (Icon 7,600 on 5,610 berths, upper-berth factor 1.35)",
    opexProv: OPEX_PROV_GT,
  },
];

function main(): void {
  const prev = JSON.parse(
    readFileSync(new URL(`data/corridor-ref/${PREV_ID}.json`, ROOT), "utf8"),
  ) as Json;

  const rows: Json[] = CRUISE.map((c) => ({
    id: c.id,
    label: c.label,
    capexUsdM: c.capexUsdM,
    opexUsdMPerYear: perDayToUsdMPerYear(c.vesselOpexUsdPerDay),
    gjPerNm: c.gjPerNm,
    verified: true,
    sourceNote:
      `Cruise research waves C1-C5 (${RESEARCH}); capex per GT from 2025 ` +
      "filings, technical opex $195/GT/yr, energy from per-ship EU MRV. " +
      "3-term energy: gjPerNm is propulsion-only, hotel load carried " +
      "separately, portGjPerDay 0 by construction",
    family: "cruise",
    defaultCargoUnit: "passenger",
    grossTonnage: c.grossTonnage,
    lowerBerths: c.lowerBerths,
    serviceSpeedKn: c.serviceSpeedKn,
    hotelLoadGjPerDay: c.hotelLoadGjPerDay,
    hotelOpexUsdMPerYear: perDayToUsdMPerYear(c.hotelOpexUsdPerDay),
    // Berth hotel load lives inside hotelLoadGjPerDay — a port rate here
    // would count it twice (resolve.ts documents the boundary).
    portGjPerDay: 0,
    cargoSystemGjPerDay: 0,
    costYear: 2026,
    provenance: {
      capex: c.capexProv,
      opex: c.opexProv,
      hotelOpex:
        "B: pro-rata hotel/technical split of audited shipboard cost (32-40% unambiguously hotel, 60-68% unallocated, split by the stated 15%-payroll / 50%-other-operating assumptions). DATA ONLY - excluded from the engine by designation: fuel-invariant, cancels in the corridor gap",
      energy: ENERGY_PROV,
      serviceSpeed:
        "A: class service speed from the C1-C5 ladder; observed sea speeds run 12-17 kn (0.68-0.72 of design) in MRV - the region where the 2-term model's slow-steaming error is largest",
      ladenBallastSplit: LADEN_BALLAST_NOTE,
      shorePower: SHORE_POWER_NOTE,
      capacity:
        `A: ${c.lowerBerths} lower berths, max pax ${c.maxPax} (occupancy runs 105-110% of lower berths: Carnival 105%, RCL 109.7%, NCLH 103.5%), crew ${c.crew}, cabins ${c.cabins}, installed ${c.installedMw} MW. Sea days ~230, port days ~135, annual 70,000-95,000 nm`,
    },
  }));

  const vesselDerivation = JSON.parse(JSON.stringify(prev.vesselDerivation)) as Json;
  (vesselDerivation.ballastRatio as Record<string, number>).cruise = 1.0;

  const CARRIED = [
    "fuels",
    "countries",
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
        `${(prev.source as Json).note as string} | v6: six ocean-cruise ` +
        `archetypes appended (${RESEARCH}), family "cruise", 3-term energy ` +
        "(propulsion gjPerNm + speed-independent hotelLoadGjPerDay x 365; " +
        "portGjPerDay 0 by construction). Every v5 row and section is " +
        "byte-identical; vesselDerivation gains only the cruise ballast " +
        "designation (1.0 - passenger ships do not sail in ballast).",
    },
    vesselTypes: [...(prev.vesselTypes as Json[]), ...rows],
    vesselTypeAliases: prev.vesselTypeAliases,
    vesselDerivation,
    fuels: prev.fuels,
    countries: prev.countries,
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
  // Every v5 vessel row must be byte-identical; only appends allowed.
  const prevVessels = prev.vesselTypes as Json[];
  const nextVessels = next.vesselTypes as Json[];
  if (
    JSON.stringify(nextVessels.slice(0, prevVessels.length)) !==
    JSON.stringify(prevVessels)
  ) {
    throw new Error("existing vessel rows changed — v6 is append-only");
  }
  // vesselDerivation identical except the cruise ballast entry.
  const stripCruise = (d: unknown) => {
    const c = JSON.parse(JSON.stringify(d)) as Json;
    delete (c.ballastRatio as Record<string, unknown>).cruise;
    return JSON.stringify(c);
  };
  if (stripCruise(next.vesselDerivation) !== JSON.stringify(prev.vesselDerivation)) {
    throw new Error("vesselDerivation changed beyond the cruise ballast entry");
  }

  const out = new URL(`data/corridor-ref/${NEW_ID}.json`, ROOT);
  writeFileSync(out, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`wrote ${out.pathname}`);
  console.log(
    `vessels: ${prevVessels.length} carried + ${rows.length} cruise = ${nextVessels.length}`,
  );
}

main();
