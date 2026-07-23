"use client";

import { useCallback, useRef, useState } from "react";
import { toSimulateBody, wantedProfiles, type CalculatorValues } from "./schema";
import type { ApiError, ProfileStatus, SimulateResponse } from "./types";

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

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ApiError;
    if (res.status === 429) {
      const retry = res.headers.get("Retry-After");
      return `Rate limited — try again in ${retry ?? "a few"} s`;
    }
    if (body.error.code === "engine_input_error" && body.error.details) {
      const path = (body.error.details as { path?: unknown }).path;
      return Array.isArray(path)
        ? `${body.error.message} (${path.join(".")})`
        : body.error.message;
    }
    return body.error.message;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/**
 * Staged run: prefetch each enabled renewable profile through
 * GET /api/v1/resource-profiles (slow — ~1–2 min per profile — on the first
 * visit to an area, cached afterwards) so the user sees per-source progress,
 * then POST /api/v1/simulate with location refs, which is instant because the
 * profiles are now cached. Grid-only runs skip straight to simulate. A newer
 * run supersedes an in-flight one.
 */
export function useSimulation() {
  const [state, setState] = useState<SimulationState>(IDLE);
  const runId = useRef(0);

  const run = useCallback(async (values: CalculatorValues) => {
    const id = ++runId.current;
    const { lat, lon } = values.location;
    const wanted = wantedProfiles(values);

    let statuses: ProfileStatus[] = wanted.map((w) => ({
      slot: w.slot,
      kind: w.kind,
      state: "building",
    }));
    setState({
      phase: wanted.length > 0 ? "profiles" : "simulating",
      profileStatuses: statuses,
      response: null,
      error: null,
    });

    const updateStatus = (slot: "pv" | "wind", patch: Partial<ProfileStatus>) => {
      statuses = statuses.map((s) => (s.slot === slot ? { ...s, ...patch } : s));
      if (runId.current === id) {
        setState((prev) => ({ ...prev, profileStatuses: statuses }));
      }
    };

    if (wanted.length > 0) {
      const prefetches = wanted.map(async (w) => {
        const res = await fetch(
          `/api/v1/resource-profiles?lat=${lat}&lon=${lon}&kind=${w.kind}`,
        );
        if (!res.ok) {
          updateStatus(w.slot, { state: "error", message: await readError(res) });
          throw new Error(`${w.kind} profile failed`);
        }
        const profile = (await res.json()) as {
          provider: string;
          cacheHit: boolean;
          attribution: string;
        };
        updateStatus(w.slot, {
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
          setState((prev) => ({ ...prev, phase: "error", error: null }));
        }
        return;
      }
      if (runId.current !== id) return;
      setState((prev) => ({ ...prev, phase: "simulating" }));
    }

    const res = await fetch("/api/v1/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toSimulateBody(values)),
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
