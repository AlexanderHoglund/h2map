/**
 * Build the 2026-08-16-vessel-v2 reference bundle.
 *
 * Bundles are IMMUTABLE — a change publishes a new id, never an edit (see
 * ref/bundle.ts and the bundle's own source.note). So this composes a NEW
 * bundle from two sources:
 *
 *   - everything that is not a vessel (fuels, countries, benchmarkRules,
 *     fuelEmissions, constants, schedules, regulationDefaults) copied
 *     BYTE-IDENTICAL from 2026-07-30-excel-v1, and asserted so;
 *   - `vesselTypes` replaced by the v2 research rows, FLATTENED onto the
 *     live row shape (the handoff nests them under energy{}/cost{}), plus
 *     the v1 rows that v2 drops, retained verbatim.
 *
 * WHY THE OLD ROWS STAY. v2 renames all seven v1 classes and re-values six
 * of them (GJ/nm moves −54% to +50%). `getVesselType` throws on an unknown
 * id — there is no fallback, unlike countries — so a rename alone would
 * break every stored scenario, the default scenario and the golden fixture.
 * All seven are therefore retained verbatim, marked `deprecated`, so a saved
 * scenario reproduces the numbers it was saved with.
 *
 * Even the Handymax is retained rather than aliased: the research preserved
 * its GJ/nm (3.2 → 3.202) but moved its cost figures (CAPEX 35 → 34, OPEX
 * 2.8 → 2.47), so aliasing on the energy figure alone would have silently
 * re-priced every scenario using the default vessel.
 *
 *   npx tsx scripts/corridor/build-vessel-bundle.ts
 */
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url);
const V1_ID = "2026-07-30-excel-v1";
const NEW_ID = "2026-08-16-vessel-v2";

interface V2Row {
  id: string;
  label: string;
  family: string;
  dwtTonnes: number;
  teuCapacity: number | null;
  defaultCargoUnit: string;
  energy: {
    ladenGjPerNm: number;
    ballastGjPerNm: number;
    wholeVoyageGjPerNm: number;
    serviceSpeedKn: number;
    speedExponentPerNm: number;
    portGjPerDay: number;
    idleGjPerDay: number;
    cargoSystemGjPerDay: number;
  };
  cost: { newbuildUsdM: number; opexUsdMPerYear: number; costYear: number };
  provenance: Record<string, unknown>;
}

interface V2File {
  bundleId: string;
  speedLaw: { perNmExponent: number; perDayExponent: number; note: string };
  eediReferenceLines: Record<string, unknown>;
  familyCalibration: Record<string, number>;
  ballastRatio: Record<string, number>;
  method: string;
  vessels: V2Row[];
}

/**
 * v1 id → v2 id, for classes v2 renamed AND left numerically identical on
 * EVERY field the engine reads.
 *
 * Currently EMPTY, and that is the finding. `handymax-bulk-58k` looked like
 * the one safe alias — the research preserved its GJ/nm (3.2 → 3.202) — but
 * its cost figures move too: CAPEX 35 → 34, OPEX 2.8 → 2.47. Aliasing on a
 * preserved GJ/nm alone would have silently re-priced every stored scenario
 * using the default vessel. It is retained verbatim instead, like the rest.
 *
 * The mechanism stays in the bundle and the accessor because a future
 * catalogue may rename a class without touching its numbers; it just does
 * not apply to this one.
 */
const ALIASES: Record<string, string> = {};

/**
 * Every v1 id, retained verbatim. v2 renames all seven and re-values six of
 * them (GJ/nm moves −54% to +50%), so nothing can be aliased safely: a
 * stored scenario must reproduce the numbers it was saved with.
 */
const RETAIN_FROM_V1 = [
  "tanker-35k",
  "tanker-80k",
  "bulk-60k",
  "container-5k",
  "container-15k",
  "roro-ferry",
  "handymax-bulk-58k",
];

/** Flatten a nested v2 row onto the live flat row shape. */
function flatten(r: V2Row): Record<string, unknown> {
  const tier = (s: string): string => (s.match(/^([ABC]):/)?.[1] ?? "C");
  // A row is "verified" only when every parameter it carries is tier A.
  // Nothing in v2 is: `verified: false` is set on every research row, and
  // the port/idle/cargo-system rates are tier C throughout.
  return {
    id: r.id,
    label: r.label,
    capexUsdM: r.cost.newbuildUsdM,
    opexUsdMPerYear: r.cost.opexUsdMPerYear,
    gjPerNm: r.energy.wholeVoyageGjPerNm,
    verified: false,
    sourceNote: `${NEW_ID}: ${r.provenance.energy as string}; CAPEX ${tier(r.provenance.capex as string)}, OPEX ${tier(r.provenance.opex as string)}`,
    // --- v2 additive fields (all optional in the schema) ---
    family: r.family,
    dwtTonnes: r.dwtTonnes,
    ...(r.teuCapacity !== null ? { teuCapacity: r.teuCapacity } : {}),
    defaultCargoUnit: r.defaultCargoUnit,
    serviceSpeedKn: r.energy.serviceSpeedKn,
    ladenGjPerNm: r.energy.ladenGjPerNm,
    ballastGjPerNm: r.energy.ballastGjPerNm,
    portGjPerDay: r.energy.portGjPerDay,
    idleGjPerDay: r.energy.idleGjPerDay,
    cargoSystemGjPerDay: r.energy.cargoSystemGjPerDay,
    costYear: r.cost.costYear,
    provenance: r.provenance,
  };
}

function main(): void {
  const v1 = JSON.parse(
    readFileSync(new URL(`data/corridor-ref/${V1_ID}.json`, ROOT), "utf8"),
  ) as Record<string, unknown>;
  const v2 = JSON.parse(
    readFileSync(new URL("scripts/corridor/vessel-types-v2.json", ROOT), "utf8"),
  ) as V2File;

  const v1Rows = v1.vesselTypes as Record<string, unknown>[];
  const byId = new Map(v1Rows.map((r) => [r.id as string, r]));

  const rows: Record<string, unknown>[] = v2.vessels.map(flatten);
  const newIds = new Set(rows.map((r) => r.id as string));

  // Retired rows: verbatim, flagged, so an old scenario still computes what
  // it always did rather than silently adopting a re-valued class.
  for (const id of RETAIN_FROM_V1) {
    const row = byId.get(id);
    if (!row) throw new Error(`v1 row missing: ${id}`);
    if (newIds.has(id)) throw new Error(`${id} is in v2 — do not retain it`);
    rows.push({
      ...row,
      deprecated: true,
      sourceNote: `${row.sourceNote as string} — RETIRED in ${NEW_ID}: superseded by the researched catalogue, retained verbatim so scenarios pinning this id reproduce their original numbers.`,
    });
  }

  // Aliases must point at rows that exist.
  for (const [from, to] of Object.entries(ALIASES)) {
    if (!newIds.has(to)) throw new Error(`alias ${from} -> ${to}: target missing`);
    if (newIds.has(from)) throw new Error(`alias ${from} shadows a real row`);
  }

  const out: Record<string, unknown> = {
    ...v1,
    bundleId: NEW_ID,
    source: {
      ...(v1.source as Record<string, unknown>),
      note:
        `Vessel catalogue replaced from the 2026-08-16 research bundle (${v2.vessels.length} classes). ` +
        `Every non-vessel section is copied byte-identical from ${V1_ID}. ` +
        "Reference data is immutable: any change is a NEW bundle id, never an edit.",
      vesselMethod: v2.method,
    },
    vesselTypes: rows,
    vesselTypeAliases: ALIASES,
    // The parametric layer's inputs: any dwt resolves from the EEDI line ×
    // the family calibration, so the catalogue's gaps are derivable rather
    // than dead ends.
    vesselDerivation: {
      speedLaw: v2.speedLaw,
      eediReferenceLines: v2.eediReferenceLines,
      familyCalibration: v2.familyCalibration,
      ballastRatio: v2.ballastRatio,
    },
  };

  // --- assert the non-vessel sections really are byte-identical ----------
  for (const key of [
    "fuels",
    "countries",
    "benchmarkRules",
    "fuelEmissions",
    "constants",
    "schedules",
    "regulationDefaults",
    "schemaVersion",
  ]) {
    const a = JSON.stringify(v1[key]);
    const b = JSON.stringify(out[key]);
    if (a !== b) throw new Error(`${key} is not byte-identical to ${V1_ID}`);
  }

  const path = new URL(`data/corridor-ref/${NEW_ID}.json`, ROOT);
  writeFileSync(path, JSON.stringify(out, null, 2) + "\n", "utf8");

  // §19's vessel table used to be a hand-copied literal in the docs page
  // with nothing tying it to the bundle — it silently went stale every time
  // the catalogue changed. Emit it, so the documentation cannot drift from
  // the reference data it describes.
  const docRows = rows.map((r) => ({
    id: r.id as string,
    label: r.label as string,
    family: (r.family as string | undefined) ?? null,
    dwtTonnes: (r.dwtTonnes as number | undefined) ?? null,
    teuCapacity: (r.teuCapacity as number | undefined) ?? null,
    capexUsdM: r.capexUsdM as number,
    opexUsdMPerYear: r.opexUsdMPerYear as number,
    gjPerNm: r.gjPerNm as number,
    serviceSpeedKn: (r.serviceSpeedKn as number | undefined) ?? null,
    costYear: (r.costYear as number | undefined) ?? null,
    verified: r.verified as boolean,
    deprecated: (r.deprecated as boolean | undefined) ?? false,
  }));
  writeFileSync(
    new URL("data/corridor-ref/vessel-catalogue.json", ROOT),
    JSON.stringify(
      {
        generatedBy: "scripts/corridor/build-vessel-bundle.ts",
        bundleId: NEW_ID,
        note:
          "Rendered by docs §19. Every cost figure is PER SHIP; deprecated rows are retained so scenarios pinning them reproduce their original numbers.",
        rows: docRows,
      },
      null,
      1,
    ) + "\n",
    "utf8",
  );
  console.log(
    `wrote data/corridor-ref/${NEW_ID}.json: ${rows.length} vessel rows ` +
      `(${v2.vessels.length} researched + ${RETAIN_FROM_V1.length} retired), ` +
      `${Object.keys(ALIASES).length} alias(es)`,
  );
}

main();
