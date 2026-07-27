"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { decodeConfigParam } from "@/lib/url-state";
import CalculatorPanel from "./CalculatorPanel";
import {
  CALCULATOR_DEFAULTS,
  mergeConfig,
  type CalculatorValues,
} from "./schema";

/**
 * Route host for the standalone /calculator page. Resolves the initial form
 * values from the URL — full config from `?c=` (share link), else the Explorer
 * handoff `?lat=&lon=`, else reference defaults — and hands them to the shared
 * CalculatorPanel. Kept thin so the panel can be reused, embedded, inside the
 * Explorer without any route/URL coupling. Requires the <Suspense> wrapper in
 * page.tsx because of useSearchParams.
 */
export default function CalculatorClient() {
  const searchParams = useSearchParams();

  // Read once on mount.
  const [initialValues] = useState<CalculatorValues>(() => {
    const c = searchParams.get("c");
    if (c) {
      const decoded = decodeConfigParam<unknown>(c);
      if (decoded) return mergeConfig(decoded);
    }
    const out = structuredClone(CALCULATOR_DEFAULTS);
    const lat = Number(searchParams.get("lat"));
    const lon = Number(searchParams.get("lon"));
    if (
      searchParams.has("lat") &&
      searchParams.has("lon") &&
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180
    ) {
      out.location.lat = Number(lat.toFixed(6));
      out.location.lon = Number(lon.toFixed(6));
    }
    return out;
  });

  return <CalculatorPanel initialValues={initialValues} />;
}
