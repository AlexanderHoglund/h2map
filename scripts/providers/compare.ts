import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { writeJson } from "./lib/io.js";
import type { ProviderOutput } from "./lib/output.js";
import { SITES } from "./sites.js";

const SPIKE_DIR = fileURLToPath(new URL("../../data/spike/", import.meta.url));

async function load(
  slug: string,
  file: string,
): Promise<ProviderOutput | null> {
  try {
    return JSON.parse(
      await readFile(`${SPIKE_DIR}${slug}/${file}`, "utf8"),
    ) as ProviderOutput;
  } catch {
    return null;
  }
}

/** Pearson correlation over hours where both series are non-null. */
function pearson(
  a: ReadonlyArray<number | null> | undefined,
  b: ReadonlyArray<number | null> | undefined,
): number | null {
  if (!a || !b || a.length !== b.length) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x !== null && x !== undefined && y !== null && y !== undefined) {
      xs.push(x);
      ys.push(y);
    }
  }
  const n = xs.length;
  if (n < 100) return null;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0 || varY === 0) return null;
  return cov / Math.sqrt(varX * varY);
}

const fmt = (v: number | null | undefined): string =>
  v === null || v === undefined ? "  —  " : v.toFixed(3);

async function main(): Promise<void> {
  const rows: Record<string, unknown>[] = [];

  console.log(
    "\n| Site | PV CF PVGIS | PV CF OM* | PV CF NASA* | Wind CF OM | Wind CF NASA | ΔWind |OM−NASA| | r(wind OM,NASA) | r(pv PVGIS,OM*) |",
  );
  console.log(
    "|---|---|---|---|---|---|---|---|---|",
  );

  for (const site of SITES) {
    const [om, pvgis, nasa] = await Promise.all([
      load(site.slug, "open-meteo.json"),
      load(site.slug, "pvgis-seriescalc.json"),
      load(site.slug, "nasa-power.json"),
    ]);

    const pvPvgis = pvgis?.summary.pv?.meanCf ?? null;
    const pvOm = om?.summary.pv?.meanCf ?? null;
    const pvNasa = nasa?.summary.pv?.meanCf ?? null;
    const windOm = om?.summary.wind?.meanCf ?? null;
    const windNasa = nasa?.summary.wind?.meanCf ?? null;
    const windDelta =
      windOm !== null && windNasa !== null
        ? Math.abs(windOm - windNasa)
        : null;
    const rWind = pearson(om?.hourly.windCf, nasa?.hourly.windCf);
    const rPv = pearson(pvgis?.hourly.pvCf, om?.hourly.pvCf);

    console.log(
      `| ${site.name} | ${fmt(pvPvgis)} | ${fmt(pvOm)} | ${fmt(pvNasa)} | ${fmt(windOm)} | ${fmt(windNasa)} | ${fmt(windDelta)} | ${fmt(rWind)} | ${fmt(rPv)} |`,
    );

    rows.push({
      site: site.slug,
      pvCf: { pvgis: pvPvgis, openMeteoCrude: pvOm, nasaCrude: pvNasa },
      windCf: {
        openMeteo: windOm,
        nasa: windNasa,
        absDelta: windDelta,
      },
      hourlyPearson: { windOmVsNasa: rWind, pvPvgisVsOmCrude: rPv },
      monthly: {
        pvPvgis: pvgis?.summary.pv?.monthlyMeanCf ?? null,
        windOm: om?.summary.wind?.monthlyMeanCf ?? null,
        windNasa: nasa?.summary.wind?.monthlyMeanCf ?? null,
      },
    });
  }

  console.log(
    "\n* crude horizontal GHI proxy, not a PV model — magnitude/shape sanity only.\n",
  );

  await writeJson(`${SPIKE_DIR}comparison.json`, {
    generatedAt: new Date().toISOString(),
    method:
      "Annual mean capacity factors per provider; wind |OM−NASA| delta; Pearson r over hours where both series are non-null.",
    rows,
  });
  console.log(`Wrote ${SPIKE_DIR}comparison.json`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
