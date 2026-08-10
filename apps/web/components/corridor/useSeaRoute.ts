"use client";

import { useEffect, useState } from "react";
import { coordKey, type SeaRouteResponse, type SeaRouteResult } from "@/lib/seaRoute";

/**
 * Client side of the sea router: debounced fetch of the local route
 * handler whenever both port coordinates exist. Failure is a STATE, not an
 * error — consumers degrade to the schematic drawing and the typed
 * distance. A module-scope cache keeps tab switches and re-mounts from
 * refetching a deterministic result.
 */

export interface SeaRouteState {
  status: "idle" | "loading" | "ok" | "failed";
  data?: SeaRouteResult;
}

const clientCache = new Map<string, SeaRouteState>();

export function useSeaRoute(
  a: { lat: number; lon: number } | undefined,
  b: { lat: number; lon: number } | undefined,
): SeaRouteState {
  const aLat = a?.lat;
  const aLon = a?.lon;
  const bLat = b?.lat;
  const bLon = b?.lon;
  const key =
    aLat !== undefined && aLon !== undefined && bLat !== undefined && bLon !== undefined
      ? `${coordKey(aLat, aLon)}|${coordKey(bLat, bLon)}`
      : null;

  const [state, setState] = useState<SeaRouteState>(
    () => (key ? clientCache.get(key) : undefined) ?? { status: "idle" },
  );

  useEffect(() => {
    if (!key) {
      setState({ status: "idle" });
      return;
    }
    const cached = clientCache.get(key);
    if (cached) {
      setState(cached);
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    // Debounce: coordinate typing produces a burst of intermediate pairs.
    const timer = setTimeout(() => {
      fetch(`/api/v1/corridor/searoute?from=${aLat},${aLon}&to=${bLat},${bLon}`)
        .then((res) => (res.ok ? (res.json() as Promise<SeaRouteResponse>) : null))
        .then((body) => {
          const next: SeaRouteState =
            body?.ok && body.route
              ? { status: "ok", data: body.route }
              : { status: "failed" };
          clientCache.set(key, next);
          if (!cancelled) setState(next);
        })
        .catch(() => {
          // Transport failure: degrade quietly, but do NOT cache it — a
          // navigation later may succeed.
          if (!cancelled) setState({ status: "failed" });
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, aLat, aLon, bLat, bLon]);

  return state;
}
