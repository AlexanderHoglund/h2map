import { fileURLToPath } from "node:url";
import { fetchNasaPower } from "./fetch-nasa-power.js";
import { fetchOpenMeteo } from "./fetch-open-meteo.js";
import { fetchPvgisSeries, fetchPvgisTmy } from "./fetch-pvgis.js";
import { delay, writeJson } from "./lib/io.js";
import type { ProviderOutput } from "./lib/output.js";
import { SITES, type Site } from "./sites.js";

const SPIKE_DIR = fileURLToPath(new URL("../../data/spike/", import.meta.url));
const INTER_REQUEST_DELAY_MS = 1000;

const FETCHERS: Array<{
  file: string;
  fetch: (site: Site) => Promise<ProviderOutput>;
}> = [
  { file: "open-meteo.json", fetch: fetchOpenMeteo },
  { file: "pvgis-seriescalc.json", fetch: fetchPvgisSeries },
  { file: "pvgis-tmy.json", fetch: fetchPvgisTmy },
  { file: "nasa-power.json", fetch: fetchNasaPower },
];

async function main(): Promise<void> {
  const failures: string[] = [];
  for (const site of SITES) {
    console.log(`\n=== ${site.name} (${site.lat}, ${site.lon}) ===`);
    for (const { file, fetch } of FETCHERS) {
      const label = `${site.slug}/${file}`;
      try {
        const output = await fetch(site);
        await writeJson(`${SPIKE_DIR}${site.slug}/${file}`, output);
        const { pv, wind } = output.summary;
        console.log(
          `  ${file}: ` +
            (pv ? `pv mean CF ${pv.meanCf.toFixed(3)} ` : "") +
            (wind ? `wind mean CF ${wind.meanCf.toFixed(3)} ` : "") +
            ((pv?.gapHours ?? 0) + (wind?.gapHours ?? 0) > 0
              ? `(gaps: pv ${pv?.gapHours ?? 0}, wind ${wind?.gapHours ?? 0})`
              : ""),
        );
      } catch (err) {
        console.error(`  ${label} FAILED: ${String(err)}`);
        failures.push(label);
      }
      await delay(INTER_REQUEST_DELAY_MS);
    }
  }
  if (failures.length > 0) {
    console.error(`\n${failures.length} fetches failed: ${failures.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("\nAll fetches succeeded.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
