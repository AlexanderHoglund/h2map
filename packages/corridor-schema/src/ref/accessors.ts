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

export function getVesselType(bundle: RefBundle, id: string): RefVesselType {
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
