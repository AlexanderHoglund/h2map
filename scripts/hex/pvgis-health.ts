/**
 * PVGIS health probe — a gate for the Kenya recovery workflow.
 *
 * PVGIS suffered a persistent regional 500 outage that masked most of Kenya's
 * solar cells. Rather than hammer it while it is down, the recovery workflow
 * runs a clean re-seed only when PVGIS is actually serving again. This probes a
 * few canary coordinates that are known to return good SARAH3 data when PVGIS
 * is healthy and writes `healthy=true|false` to $GITHUB_OUTPUT.
 *
 *   npx tsx scripts/hex/pvgis-health.ts
 */
import { appendFileSync } from "node:fs";
import { fetchPvgisPv } from "@h2map/profile-service";
import { fetchJson } from "../lib/serviceDeps";

// Canaries spread across Kenya's extent. PVGIS's outage is intermittent — it
// 500s ~80% of cells while still serving a lucky few — so a couple of canaries
// passing does NOT mean it can serve a full re-seed. Probe a broad spread and
// require a clear majority, so the recovery workflow only fires when PVGIS is
// genuinely up region-wide (not grinding through 500s). Whether the DATA is
// physical is irrelevant here — we only check that PVGIS RESPONDS (HTTP 200).
const CANARIES: [number, number][] = [
  [3.3, 35.5], // NW
  [2.7, 37.7], // N-central
  [3.9, 41.1], // NE
  [0.5, 37.3], // central (Laikipia)
  [-1.3, 36.8], // Nairobi
  [-4.0, 39.6], // coast (Mombasa)
  [1.4, 39.0], // E (Wajir)
  [0.3, 34.8], // W (Kisumu)
];
const MIN_OK = 6; // healthy only if ≥6/8 respond — broad regional availability

async function main(): Promise<void> {
  let ok = 0;
  for (const [lat, lon] of CANARIES) {
    try {
      await fetchPvgisPv(fetchJson, lat, lon, "pv_fixed");
      ok++;
      console.log(`  canary (${lat}, ${lon}): ok`);
    } catch (err) {
      console.log(`  canary (${lat}, ${lon}): FAILED — ${String(err)}`);
    }
  }
  const healthy = ok >= MIN_OK;
  console.log(`PVGIS canaries: ${ok}/${CANARIES.length} ok → healthy=${healthy}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `healthy=${healthy}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  // A crash is not "healthy" — write false so the workflow skips the re-seed.
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `healthy=false\n`);
  }
});
