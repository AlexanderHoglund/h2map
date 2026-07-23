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
 * Turn the visible cell ids into deck.gl data. A cell that is missing or not
 * ready renders its nearest ready ancestor's value (down to res 2) as a
 * parent-fill; cells whose whole known ancestry is missing are skipped, so
 * ocean stays intentionally empty.
 */
export function buildRenderData(
  cache: CellCache,
  visibleIds: string[],
  layer: LayerKey,
): HexDatum[] {
  const out: HexDatum[] = [];
  for (const id of visibleIds) {
    const own = readyValue(cache.get(id), layer);
    if (own) {
      out.push({ h3: id, value: own.value, data: own.data, parentFill: false });
      continue;
    }
    let res = getResolution(id);
    let cur = id;
    let hit: { value: number; data: CellData } | null = null;
    while (res > MIN_RES) {
      cur = cellToParent(cur, res - 1);
      res -= 1;
      hit = readyValue(cache.get(cur), layer);
      if (hit) break;
    }
    if (hit) {
      out.push({ h3: id, value: hit.value, data: hit.data, parentFill: true });
    }
  }
  return out;
}
