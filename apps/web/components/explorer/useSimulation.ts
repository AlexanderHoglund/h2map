"use client";

import { useCallback, useRef, useState } from "react";
import type {
  ApiError,
  ProfileStatus,
  SimulateResponse,
  UiConfig,
} from "./types";

export interface SimulationState {
  phase: "idle" | "profiles" | "simulating" | "done" | "error";
  profileStatuses: ProfileStatus[];
  response: SimulateResponse | null;
  error: string | null;
}

const IDLE: SimulationState = {
  phase: "idle",
  profileStatuses: [],
  response: null,
  error: null,
};

function buildInputs(config: UiConfig) {
  return {
    finance: {
      lifetimeYears: config.lifetimeYears,
      discountRate: config.discountRate,
    },
    electrolyzer: {
      capacityMw: config.electrolyzerCapacityMw,
      capexUsdPerKw: config.electrolyzerCapexUsdPerKw,
      opexFractionPerYear: config.electrolyzerOpexFraction,
      efficiencyLhv: config.efficiencyLhv,
      degradationPerYear: config.degradationPerYear,
      stackLifetimeHours: config.stackLifetimeHours,
      stackReplacementCostFraction: config.stackReplacementCostFraction,
    },
    ...(config.pvEnabled
      ? {
          pv: {
            capacityMw: config.pvCapacityMw,
            pricing: { mode: "lcoe", usdPerMwh: config.pvLcoeUsdPerMwh },
          },
        }
      : {}),
    ...(config.windEnabled
      ? {
          wind: {
            capacityMw: config.windCapacityMw,
            pricing: { mode: "lcoe", usdPerMwh: config.windLcoeUsdPerMwh },
          },
        }
      : {}),
    ...(config.gridEnabled
      ? {
          grid: {
            maxImportMw: config.gridMaxImportMw,
            priceUsdPerMwh: config.gridPriceUsdPerMwh,
            emissionFactorTco2PerMwh: config.gridEfTco2PerMwh,
          },
        }
      : {}),
    water: {
      priceUsdPerM3: config.waterPriceUsdPerM3,
      transportUsdPerM3Per100Km: 0.09,
      transportDistanceKm: 0,
      desalinated: false,
      pumpingHeadM: 0,
    },
  };
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ApiError;
    if (res.status === 429) {
      const retry = res.headers.get("Retry-After");
      return `Rate limited — try again in ${retry ?? "a few"} s`;
    }
    return body.error.message;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/**
 * Click → staged run: prefetch each enabled profile (GET /resource-profiles —
 * slow on first visit to an area, cached afterwards) so the user sees
 * per-source progress, then POST /simulate with location refs (instant, the
 * profiles are now cached). A newer run supersedes an in-flight one.
 */
export function useSimulation() {
  const [state, setState] = useState<SimulationState>(IDLE);
  const runId = useRef(0);

  const run = useCallback(async (lat: number, lon: number, config: UiConfig) => {
    const id = ++runId.current;
    const wanted: { slot: "pv" | "wind"; kind: string }[] = [];
    if (config.pvEnabled) wanted.push({ slot: "pv", kind: config.pvKind });
    if (config.windEnabled) wanted.push({ slot: "wind", kind: config.windKind });
    if (wanted.length === 0) {
      setState({ ...IDLE, phase: "error", error: "Enable at least one renewable source" });
      return;
    }

    let statuses: ProfileStatus[] = wanted.map((w) => ({
      kind: w.kind,
      state: "building",
    }));
    setState({ phase: "profiles", profileStatuses: statuses, response: null, error: null });

    const updateStatus = (kind: string, patch: Partial<ProfileStatus>) => {
      statuses = statuses.map((s) => (s.kind === kind ? { ...s, ...patch } : s));
      if (runId.current === id) {
        setState((prev) => ({ ...prev, profileStatuses: statuses }));
      }
    };

    const prefetches = wanted.map(async (w) => {
      const res = await fetch(
        `/api/v1/resource-profiles?lat=${lat}&lon=${lon}&kind=${w.kind}`,
      );
      if (!res.ok) {
        updateStatus(w.kind, { state: "error", message: await readError(res) });
        throw new Error(`${w.kind} profile failed`);
      }
      const profile = (await res.json()) as {
        provider: string;
        cacheHit: boolean;
        attribution: string;
      };
      updateStatus(w.kind, {
        state: "ready",
        provider: profile.provider,
        cacheHit: profile.cacheHit,
        attribution: profile.attribution,
      });
    });

    try {
      await Promise.all(prefetches);
    } catch {
      if (runId.current === id) {
        setState((prev) => ({
          ...prev,
          phase: "error",
          error: "Could not build a resource profile for this location",
        }));
      }
      return;
    }
    if (runId.current !== id) return;

    setState((prev) => ({ ...prev, phase: "simulating" }));
    const body = {
      inputs: buildInputs(config),
      profiles: {
        ...(config.pvEnabled ? { pv: { lat, lon, kind: config.pvKind } } : {}),
        ...(config.windEnabled
          ? { wind: { lat, lon, kind: config.windKind } }
          : {}),
      },
    };
    const res = await fetch("/api/v1/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (runId.current !== id) return;
    if (!res.ok) {
      const message = await readError(res);
      setState((prev) => ({ ...prev, phase: "error", error: message }));
      return;
    }
    const response = (await res.json()) as SimulateResponse;
    setState({ phase: "done", profileStatuses: statuses, response, error: null });
  }, []);

  const reset = useCallback(() => {
    runId.current++;
    setState(IDLE);
  }, []);

  return { state, run, reset };
}
