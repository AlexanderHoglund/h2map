import { cellToParent, getResolution } from "h3-js";
import {
  layerValue,
  type CacheEntry,
  type CellData,
  type HexDatum,
  type LayerKey,
} from "./types";
import { MIN_RES } from "./viewport";

/**
 * LRU cache of hex cells keyed by H3 id. Entries are either server data or
 * "missing" (the server did not return the id — ocean or unseeded; never
 * re-requested this session outside the computing re-poll).
 */
export class CellCache {
  private entries = new Map<string, CacheEntry>();

  constructor(private readonly capacity: number) {}

  has(id: string): boolean {
    return this.entries.has(id);
  }

  get(id: string): CacheEntry | undefined {
    const value = this.entries.get(id);
    if (value !== undefined) {
      // Refresh recency (Map preserves insertion order).
      this.entries.delete(id);
      this.entries.set(id, value);
    }
    return value;
  }

  set(id: string, value: CacheEntry): void {
    if (this.entries.has(id)) this.entries.delete(id);
    this.entries.set(id, value);
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}

function readyValue(
  entry: CacheEntry | undefined,
  layer: LayerKey,
): { value: number; data: CellData } | null {
  if (!entry || entry === "missing" || entry.status !== "ready") return null;
  const value = layerValue(entry, layer);
  return value == null ? null : { value, data: entry };
}

/**
 * Refine to a finer level once this share of renderable cells has own data.
 * Deliberately lenient: wide viewports usually include unseeded surroundings
 * that would otherwise hold the whole view coarse until zoomed way in; gaps
 * render at the same geometry with inherited values, so early refinement
 * stays visually uniform.
 */
const COVERAGE_THRESHOLD = 0.35;

interface Resolved {
  value: number;
  data: CellData;
  own: boolean;
}

/** The cell's own value if ready, else its nearest ready ancestor's. */
function resolve(
  cache: CellCache,
  id: string,
  layer: LayerKey,
): Resolved | null {
  const own = readyValue(cache.get(id), layer);
  if (own) return { ...own, own: true };
  let res = getResolution(id);
  let cur = id;
  while (res > MIN_RES) {
    cur = cellToParent(cur, res - 1);
    res -= 1;
    const hit = readyValue(cache.get(cur), layer);
    if (hit) return { ...hit, own: false };
  }
  return null;
}

/**
 * Turn the visible cell ids into deck.gl data at ONE uniform resolution per
 * viewport: the finest level (≤ the zoom-mapped one) where at least
 * COVERAGE_THRESHOLD of the renderable cells have their own ready data.
 * Cells still missing at the chosen level inherit their nearest ready
 * ancestor's value at the same geometry (slight alpha dip), so the mosaic
 * refines as a whole as seeding lands instead of patchworking hex sizes.
 * Ocean cells (no known ancestry) are never drawn; they are also excluded
 * from the coverage denominator so coastal viewports still refine.
 *
 * `floorRes` makes the size progression monotonic across interactions: the
 * caller passes the currently displayed resolution so zooming/panning never
 * snaps back to coarser hexes — only a drop in the zoom-mapped ceiling
 * (zooming out) coarsens the display.
 */
export function buildRenderData(
  cache: CellCache,
  visibleIds: string[],
  layer: LayerKey,
  floorRes: number = MIN_RES,
): { data: HexDatum[]; res: number } {
  if (visibleIds.length === 0) return { data: [], res: MIN_RES };
  const mappedRes = getResolution(visibleIds[0]!);
  const floor = Math.max(MIN_RES, Math.min(floorRes, mappedRes));

  let chosenIds = visibleIds;
  let chosenRes = mappedRes;
  let chosenResolved: (Resolved | null)[] = [];
  for (let res = mappedRes; res >= floor; res -= 1) {
    const ids =
      res === mappedRes
        ? visibleIds
        : [...new Set(visibleIds.map((id) => cellToParent(id, res)))];
    const resolved = ids.map((id) => resolve(cache, id, layer));
    const renderable = resolved.filter((r) => r !== null);
    const ownCount = renderable.filter((r) => r!.own).length;
    chosenIds = ids;
    chosenRes = res;
    chosenResolved = resolved;
    if (
      renderable.length > 0 &&
      ownCount / renderable.length >= COVERAGE_THRESHOLD
    ) {
      break; // finest level with good coverage
    }
  }

  const out: HexDatum[] = [];
  for (let i = 0; i < chosenIds.length; i++) {
    const r = chosenResolved[i];
    if (!r) continue;
    out.push({
      h3: chosenIds[i]!,
      value: r.value,
      data: r.data,
      parentFill: !r.own,
    });
  }
  return { data: out, res: chosenRes };
}
