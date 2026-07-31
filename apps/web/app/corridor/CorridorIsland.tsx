"use client";

import dynamic from "next/dynamic";

/**
 * Client island: the corridor tool is fully client-side (the pure engine runs
 * on every keystroke) and pulls in recharts, so it loads as its own chunk with
 * no SSR — same pattern as the Explorer map.
 */
const CorridorClient = dynamic(() => import("@/components/corridor/CorridorClient"), {
  ssr: false,
  loading: () => (
    <main className="mx-auto max-w-6xl px-4 py-16 text-sm text-neutral-500">…</main>
  ),
});

export default function CorridorIsland() {
  return <CorridorClient />;
}
