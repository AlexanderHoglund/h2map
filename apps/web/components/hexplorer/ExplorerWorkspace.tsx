"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import HexplorerMap from "./HexplorerMap";
import { CALCULATOR_DEFAULTS, type CalculatorValues } from "../calculator/schema";

// The calculator (recharts + results) is heavy; load it only when the user
// first evaluates a cell so the Explorer's initial bundle stays lean.
const CalculatorPanel = dynamic(
  () => import("../calculator/CalculatorPanel"),
  { ssr: false, loading: () => <PanelSkeleton /> },
);

/**
 * Explorer workspace: the map and, on demand, an embedded calculator panel
 * side by side. "Evaluate here" opens the panel instead of navigating to
 * /calculator — exploring and evaluating happen in one view. On md+ the panel
 * is a fixed-width column that the map flexes around (the map's ResizeObserver
 * reflows the GL canvas); below md it's a full-bleed overlay.
 */
export default function ExplorerWorkspace() {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  // Built once, on the first evaluate, so the form mounts at the right location
  // and useForm's defaultValues stay stable. Later cells flow through `coords`.
  const [seed, setSeed] = useState<CalculatorValues | null>(null);

  const handleEvaluate = useCallback(
    (lat: number, lon: number) => {
      setSeed((prev) => {
        if (prev) return prev;
        const v = structuredClone(CALCULATOR_DEFAULTS);
        v.location.lat = Number(lat.toFixed(6));
        v.location.lon = Number(lon.toFixed(6));
        return v;
      });
      setCoords({ lat, lon });
      setOpen(true);
    },
    [],
  );

  return (
    <div className="relative flex h-full w-full">
      <div className="relative min-w-0 flex-1">
        <HexplorerMap onEvaluate={handleEvaluate} />
      </div>
      {open && seed && (
        <aside className="absolute inset-0 z-30 bg-white md:static md:z-auto md:w-[460px] md:shrink-0 md:border-l md:border-neutral-200 dark:bg-neutral-950 md:dark:border-neutral-800">
          <CalculatorPanel
            embedded
            initialValues={seed}
            coords={coords}
            onClose={() => setOpen(false)}
          />
        </aside>
      )}
    </div>
  );
}

function PanelSkeleton() {
  const t = useTranslations("explorer");
  return (
    <div className="flex h-full items-center justify-center text-sm text-neutral-500 dark:text-neutral-400">
      <span className="inline-flex items-center gap-2">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-blue-600 dark:border-neutral-700 dark:border-t-blue-400" />
        {t("panel.loading")}
      </span>
    </div>
  );
}
