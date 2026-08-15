/**
 * Solar CF cross-check against published references (T1).
 *
 * A regression net for the PV chain: at well-studied sites the modelled
 * fixed-tilt capacity factor is compared against Global Solar Atlas /
 * published bands. It catches a mounting bug, a units error, or a provider
 * silently degrading — the class of fault that a colour ramp hides.
 *
 * It is NOT a bias correction and does not gate anything: PVGIS v5_3 serves
 * ERA5 reanalysis everywhere outside the Meteosat disc (SARAH3's coverage),
 * which reads a few percent differently from satellite-derived products
 * like GSA. A cell BELOW its band is therefore a finding to record, not
 * automatically a defect — the exit code is informational.
 *
 *   npm run cells:check-cf
 */
import { cellToLatLng, latLngToCell } from "h3-js";
import { getResourceProfile } from "@h2map/profile-service";
import {
  fetchJson,
  makeCache,
  makeSupabase,
  makeTurbineLoader,
} from "../lib/serviceDeps";

/**
 * Published fixed-tilt PV capacity-factor bands. Sources: Global Solar
 * Atlas (World Bank/Solargis) PVOUT for optimally-tilted fixed mounting,
 * converted to CF; cross-read against national resource assessments.
 * Deliberately hardcoded here rather than fetched — a reference point that
 * moves with the thing it checks is not a reference point.
 */
export const CF_REFERENCES: readonly {
  name: string;
  lat: number;
  lon: number;
  band: readonly [number, number];
}[] = [
  { name: "Pilbara, AU", lat: -22.0, lon: 118.5, band: [0.24, 0.27] },
  { name: "Alice Springs, AU", lat: -23.7, lon: 133.9, band: [0.23, 0.26] },
  { name: "Queensland coast, AU", lat: -19.3, lon: 146.8, band: [0.2, 0.24] },
  { name: "South Australia", lat: -32.5, lon: 137.8, band: [0.21, 0.25] },
  { name: "Hobart, TAS", lat: -42.9, lon: 147.3, band: [0.17, 0.19] },
  { name: "Atacama, CL", lat: -23.5, lon: -68.5, band: [0.28, 0.32] },
  { name: "Turkana, KE", lat: 2.5, lon: 36.8, band: [0.19, 0.23] },
];

/** How far below the band counts as a flag, in CF points. */
const TOLERANCE = 0.03;

async function main(): Promise<void> {
  const db = makeSupabase();
  const deps = {
    // Cache-only: this checks what the MAP shows, not what a fresh fetch
    // would return. A cell with no cached profile is reported, not fetched.
    fetchJson: (() => {
      throw new Error("cache-only");
    }) as unknown as typeof fetchJson,
    cache: makeCache(db),
    getTurbineCurve: makeTurbineLoader(db),
    windAirDensityCorrection: true,
    windTurbineClassSelection: true,
    pvMaskUnservable: true,
    validateProfiles: true,
  };

  let flagged = 0;
  let checked = 0;
  console.log(
    "site                      lat/lon            model CF   band          verdict   database",
  );
  for (const ref of CF_REFERENCES) {
    // Snap to the map's own res-4 cell so we check what a viewer sees.
    const [lat, lon] = cellToLatLng(latLngToCell(ref.lat, ref.lon, 4));
    let cf: number | null = null;
    let db_ = "";
    try {
      const p = await getResourceProfile({ lat, lon, kind: "pv_fixed" }, deps);
      cf = p.cf.reduce((a, b) => a + b, 0) / p.cf.length;
      db_ = /pvgis-5\.3-([a-z0-9-]+?)-pv_/.exec(p.datasetVersion)?.[1] ?? "?";
    } catch {
      console.log(`${ref.name.padEnd(24)} ${`${lat.toFixed(1)},${lon.toFixed(1)}`.padEnd(18)} (no cached profile)`);
      continue;
    }
    checked += 1;
    const [lo, hi] = ref.band;
    const below = cf < lo - TOLERANCE;
    if (below) flagged += 1;
    const verdict = below ? "BELOW" : cf > hi ? "above" : "in band";
    console.log(
      `${ref.name.padEnd(24)} ${`${lat.toFixed(1)},${lon.toFixed(1)}`.padEnd(18)} ` +
        `${cf.toFixed(3).padStart(8)}   ${`${lo.toFixed(2)}-${hi.toFixed(2)}`.padEnd(12)}  ` +
        `${verdict.padEnd(8)}  ${db_}`,
    );
  }
  console.log(
    `\n${checked} checked, ${flagged} more than ${TOLERANCE} below band.` +
      (flagged > 0
        ? "\nNOTE: below-band cells outside the Meteosat disc are served by ERA5 " +
          "reanalysis (the only PVGIS v5_3 option there); a gap vs satellite-derived " +
          "GSA is expected and is a data-source finding, not a model regression."
        : ""),
  );
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
