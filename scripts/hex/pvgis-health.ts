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

// Canaries: Kenya coordinates that returned valid PV (peak ~0.82) when PVGIS
// was healthy. If PVGIS serves these, the region is up.
const CANARIES: [number, number][] = [
  [2.7, 37.7],
  [3.2382, 37.1949],
  [4.1966, 36.6584],
];
const MIN_OK = 2; // healthy if at least this many canaries succeed

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
