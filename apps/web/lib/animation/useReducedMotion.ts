"use client";

import { useSyncExternalStore } from "react";

/**
 * Tracks `prefers-reduced-motion: reduce`, live.
 *
 * `useSyncExternalStore` rather than useState+useEffect: there is no effect
 * and no setter, so `react-hooks/set-state-in-effect` cannot apply and the
 * value is correct on the very first render instead of flipping after mount.
 *
 * The server snapshot is `true` — if this ever renders server-side the safe
 * default is *no motion*, which also means the first client paint is a still
 * frame rather than a flash of animation.
 */

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return true;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
