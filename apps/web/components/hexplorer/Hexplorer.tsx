"use client";

import dynamic from "next/dynamic";

/** maplibre + deck.gl are browser-only; skip SSR for the whole workspace. */
const ExplorerWorkspace = dynamic(() => import("./ExplorerWorkspace"), {
  ssr: false,
});

export default function Hexplorer() {
  return <ExplorerWorkspace />;
}
