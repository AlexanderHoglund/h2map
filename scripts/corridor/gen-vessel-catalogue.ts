/**
 * Regenerate data/corridor-ref/vessel-catalogue.json — the docs §17 vessel
 * table's data source — as a straight projection of the LIVE bundle.
 *
 * The catalogue previously came out of build-vessel-bundle.ts and stayed
 * pinned to whatever bundle that script last built (it sat on
 * 2026-08-17-vessel-v3 through two bundle releases, so the docs table
 * showed pre-verification values and no cruise rows). This script has one
 * job and no side effects: read the bundle the app ships, project the
 * display fields, write the catalogue. Run it whenever the live bundle id
 * changes.
 *
 * Run: npx tsx scripts/corridor/gen-vessel-catalogue.ts
 */

import { readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url);
const LIVE_ID = "2026-08-21-cruise-v6";

interface VesselRow {
  id: string;
  label: string;
  family?: string;
  dwtTonnes?: number;
  teuCapacity?: number;
  grossTonnage?: number;
  lowerBerths?: number;
  capexUsdM: number;
  opexUsdMPerYear: number;
  gjPerNm: number;
  hotelLoadGjPerDay?: number;
  serviceSpeedKn?: number;
  costYear?: number;
  verified: boolean;
  deprecated?: boolean;
}

function main(): void {
  const bundle = JSON.parse(
    readFileSync(new URL(`data/corridor-ref/${LIVE_ID}.json`, ROOT), "utf8"),
  ) as { bundleId: string; vesselTypes: VesselRow[] };

  const rows = bundle.vesselTypes.map((v) => ({
    id: v.id,
    label: v.label,
    family: v.family ?? null,
    dwtTonnes: v.dwtTonnes ?? null,
    teuCapacity: v.teuCapacity ?? null,
    grossTonnage: v.grossTonnage ?? null,
    lowerBerths: v.lowerBerths ?? null,
    capexUsdM: v.capexUsdM,
    opexUsdMPerYear: v.opexUsdMPerYear,
    gjPerNm: v.gjPerNm,
    hotelLoadGjPerDay: v.hotelLoadGjPerDay ?? null,
    serviceSpeedKn: v.serviceSpeedKn ?? null,
    costYear: v.costYear ?? null,
    verified: v.verified,
    deprecated: v.deprecated ?? false,
  }));

  const out = {
    generatedBy: "scripts/corridor/gen-vessel-catalogue.ts",
    bundleId: bundle.bundleId,
    note:
      "Display projection of the live reference bundle for the docs vessel " +
      "table. Regenerate whenever the live bundle id changes; the bundle " +
      "itself is the source of truth.",
    rows,
  };

  const dest = new URL("data/corridor-ref/vessel-catalogue.json", ROOT);
  writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`wrote vessel-catalogue.json (${bundle.bundleId}, ${rows.length} rows)`);
}

main();
