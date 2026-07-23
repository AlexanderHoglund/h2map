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
 * Turn the visible cell ids into deck.gl data. Hexes only get smaller where
 * finer data actually exists:
 *
 * - a ready cell renders itself;
 * - a cell without data falls back to its nearest ready ancestor. If that
 *   ancestor has NO ready descendants on screen, the ancestor is drawn once
 *   at its own (larger) geometry — crisp, full opacity. If the ancestor is
 *   partially refined (some children ready), only the missing children are
 *   drawn at child geometry carrying the ancestor's value, so coverage stays
 *   complete without double-drawing;
 * - cells whose whole known ancestry is missing are skipped (ocean stays
 *   intentionally empty).
 */
export function buildRenderData(
  cache: CellCache,
  visibleIds: string[],
  layer: LayerKey,
): HexDatum[] {
  const out: HexDatum[] = [];
  const readySelf = new Set<string>();
  const pending = new Map<
    string,
    { ids: string[]; value: number; data: CellData }
  >();

  for (const id of visibleIds) {
    const own = readyValue(cache.get(id), layer);
    if (own) {
      readySelf.add(id);
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
      const group = pending.get(cur);
      if (group) group.ids.push(id);
      else pending.set(cur, { ids: [id], value: hit.value, data: hit.data });
    }
  }

  for (const [ancestor, group] of pending) {
    const ancestorRes = getResolution(ancestor);
    // Partially refined if any on-screen ready cell descends from this
    // ancestor — then fill the gaps at child geometry; otherwise draw the
    // ancestor itself once, at its true (larger) size.
    let partiallyRefined = false;
    for (const selfId of readySelf) {
      if (
        getResolution(selfId) > ancestorRes &&
        cellToParent(selfId, ancestorRes) === ancestor
      ) {
        partiallyRefined = true;
        break;
      }
    }
    if (partiallyRefined) {
      for (const id of group.ids) {
        out.push({ h3: id, value: group.value, data: group.data, parentFill: true });
      }
    } else {
      out.push({
        h3: ancestor,
        value: group.value,
        data: group.data,
        parentFill: false,
      });
    }
  }
  return out;
}
