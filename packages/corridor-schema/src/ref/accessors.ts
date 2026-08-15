/**
 * Typed lookups over a parsed reference bundle. Throw on a missing id —
 * a scenario referencing an id its pinned bundle doesn't contain is corrupt,
 * never a silent default.
 */

import type { RefBundle, RefCountry, RefFuel, RefVesselType } from "./bundle";

function find<T extends { id: string }>(
  list: readonly T[],
  id: string,
  kind: string,
  bundleId: string,
): T {
  const hit = list.find((x) => x.id === id);
  if (!hit) {
    throw new Error(`${kind} "${id}" not found in reference bundle ${bundleId}`);
  }
  return hit;
}

/**
 * Resolve a vessel type, following the bundle's rename aliases first.
 *
 * A catalogue revision may rename a class (`handymax-bulk-58k` →
 * `bulk-handymax-58k`). Stored scenarios pin the OLD id, and there is
 * deliberately no fallback row for vessels — an unknown id throws — so a
 * bare rename would break every saved scenario, the default scenario and
 * the golden fixture at once. `vesselTypeAliases` maps the old name onto
 * the new row.
 *
 * Aliases are only ever declared for renames that PRESERVE the numbers. A
 * class whose figures moved keeps its own `deprecated: true` row, so an old
 * scenario reproduces what it always computed rather than silently adopting
 * a re-valued class.
 */
export function getVesselType(bundle: RefBundle, id: string): RefVesselType {
  const direct = bundle.vesselTypes.find((v) => v.id === id);
  if (direct) return direct;
  const aliased = bundle.vesselTypeAliases?.[id];
  if (aliased !== undefined) {
    return find(bundle.vesselTypes, aliased, "vessel type", bundle.bundleId);
  }
  return find(bundle.vesselTypes, id, "vessel type", bundle.bundleId);
}

export function getFuel(bundle: RefBundle, id: string): RefFuel {
  return find(bundle.fuels, id, "fuel", bundle.bundleId);
}

export function getCountry(bundle: RefBundle, id: string): RefCountry {
  const hit = bundle.countries.find((c) => c.id === id);
  if (hit) return hit;
  // Any-country selection: ids outside the workbook's benchmark set resolve
  // to the generic "other" WACC benchmark instead of failing — the workbook
  // itself models unlisted countries this way (Data_tables "Other" row).
  const other = bundle.countries.find((c) => c.id === "other");
  if (other) return { ...other, id, label: id };
  return find(bundle.countries, id, "country", bundle.bundleId);
}
