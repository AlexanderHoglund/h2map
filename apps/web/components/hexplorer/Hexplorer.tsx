"use client";

import dynamic from "next/dynamic";

/** maplibre + deck.gl are browser-only; skip SSR for the map itself. */
const HexplorerMap = dynamic(() => import("./HexplorerMap"), { ssr: false });

export default function Hexplorer() {
  return <HexplorerMap />;
}
