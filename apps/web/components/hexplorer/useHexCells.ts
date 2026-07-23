"use client";

import { useCallback, useEffect, useState } from "react";
import { CellCache } from "./cellCache";
import type { CellData } from "./types";

/** API hard limit is 4096 ids/request; we chunk well below it. */
const CHUNK_SIZE = 1024;
/** Re-poll backoff for status="computing" cells; stop after 5 tries. */
const POLL_BACKOFF_MS = [10_000, 30_000, 60_000, 60_000, 60_000] as const;
const MAX_POLLS = POLL_BACKOFF_MS.length;
const CACHE_CAPACITY = 30_000;
/** Fallback wait when a 429 has no usable Retry-After header. */
const DEFAULT_RETRY_AFTER_MS = 5_000;
const MAX_RATE_LIMIT_RETRIES = 2;

interface HexResponse {
  cells: CellData[];
}

export interface HexCellEngine {
  cache: CellCache;
  /** Request any ids not already cached or in flight, chunked. */
  requestCells(ids: string[]): void;
  activate(): void;
  dispose(): void;
}

/**
 * Cache + fetch loop for /api/v1/hex, kept outside React state: cell data
 * lives in the LRU cache and `onChange` fires whenever it changes, so the
 * caller can bump a cheap version counter instead of re-rendering per cell.
 */
export function createHexCellEngine(onChange: () => void): HexCellEngine {
  const cache = new CellCache(CACHE_CAPACITY);
  const pending = new Set<string>();
  const pollAttempts = new Map<string, number>();
  const timers = new Set<number>();
  let alive = true;

  function schedule(fn: () => void, ms: number): void {
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (alive) fn();
    }, ms);
    timers.add(id);
  }

  async function fetchChunk(ids: string[], rateRetries: number): Promise<void> {
    for (const id of ids) pending.add(id);
    let cells: CellData[] | null = null;
    let rateLimited = false;
    let retryAfterMs = DEFAULT_RETRY_AFTER_MS;
    try {
      const res = await fetch("/api/v1/hex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.status === 429) {
        rateLimited = true;
        const retryAfter = Number(res.headers.get("Retry-After"));
        if (Number.isFinite(retryAfter) && retryAfter > 0) {
          retryAfterMs = retryAfter * 1000;
        }
      } else if (res.ok) {
        cells = ((await res.json()) as HexResponse).cells ?? [];
      }
    } catch {
      // Network error: leave ids unknown; the next viewport pass retries.
    } finally {
      for (const id of ids) pending.delete(id);
    }

    if (rateLimited) {
      if (rateRetries < MAX_RATE_LIMIT_RETRIES) {
        schedule(() => void fetchChunk(ids, rateRetries + 1), retryAfterMs);
      }
      return;
    }
    if (!cells || !alive) return;

    const returned = new Set<string>();
    const computing: string[] = [];
    for (const cell of cells) {
      cache.set(cell.h3, cell);
      returned.add(cell.h3);
      if (cell.status === "computing") computing.push(cell.h3);
      else pollAttempts.delete(cell.h3);
    }
    // Ids the server did not return are ocean/unseeded: cache as missing.
    for (const id of ids) {
      if (!returned.has(id)) cache.set(id, "missing");
    }

    if (computing.length > 0) {
      const groups = new Map<number, string[]>();
      for (const id of computing) {
        const attempts = pollAttempts.get(id) ?? 0;
        if (attempts >= MAX_POLLS) continue;
        pollAttempts.set(id, attempts + 1);
        const group = groups.get(attempts);
        if (group) group.push(id);
        else groups.set(attempts, [id]);
      }
      for (const [attempts, group] of groups) {
        const delay =
          POLL_BACKOFF_MS[attempts] ??
          POLL_BACKOFF_MS[POLL_BACKOFF_MS.length - 1] ??
          60_000;
        schedule(() => void fetchChunk(group, 0), delay);
      }
    }
    onChange();
  }

  function requestCells(ids: string[]): void {
    const need = ids.filter((id) => !cache.has(id) && !pending.has(id));
    for (let i = 0; i < need.length; i += CHUNK_SIZE) {
      void fetchChunk(need.slice(i, i + CHUNK_SIZE), 0);
    }
  }

  return {
    cache,
    requestCells,
    activate() {
      alive = true;
    },
    dispose() {
      alive = false;
      for (const id of timers) window.clearTimeout(id);
      timers.clear();
    },
  };
}

/** One engine per mounted map + a version counter that tracks cache changes. */
export function useHexCells() {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const [engine] = useState(() => createHexCellEngine(bump));

  useEffect(() => {
    engine.activate(); // StrictMode re-mounts dispose then re-run this effect
    return () => engine.dispose();
  }, [engine]);

  return { engine, version, bump };
}
