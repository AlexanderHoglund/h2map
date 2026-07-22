"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import InputsPanel from "./InputsPanel";
import ResultsPanel from "./ResultsPanel";
import { DEFAULT_CONFIG, type UiConfig } from "./types";
import { useSimulation } from "./useSimulation";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

export default function MapExplorer() {
  const [config, setConfig] = useState<UiConfig>(DEFAULT_CONFIG);
  const [selected, setSelected] = useState<{ lat: number; lon: number } | null>(null);
  const [tab, setTab] = useState<"results" | "inputs">("results");
  const { state, run } = useSimulation();

  const handleSelect = useCallback(
    (lat: number, lon: number) => {
      setSelected({ lat, lon });
      setTab("results");
      void run(lat, lon, config);
    },
    [run, config],
  );

  const handleApply = useCallback(() => {
    if (!selected) return;
    setTab("results");
    void run(selected.lat, selected.lon, config);
  }, [run, selected, config]);

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <MapView selected={selected} onSelect={handleSelect} />

      <div className="pointer-events-none absolute left-4 top-4 rounded-lg bg-white/90 px-3 py-2 shadow backdrop-blur dark:bg-neutral-900/90">
        <h1 className="text-sm font-semibold">H2MAP — Global LCOH Explorer</h1>
        <p className="text-xs text-neutral-500">
          Click anywhere to estimate green hydrogen cost
        </p>
      </div>

      <aside className="absolute bottom-4 right-4 top-4 flex w-[380px] max-w-[calc(100vw-2rem)] flex-col rounded-xl bg-white/95 shadow-lg backdrop-blur dark:bg-neutral-900/95">
        <div className="flex border-b border-neutral-200 dark:border-neutral-700">
          {(["results", "inputs"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 px-3 py-2 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {tab === "results" ? (
            <ResultsPanel state={state} />
          ) : (
            <InputsPanel
              config={config}
              onChange={setConfig}
              onApply={handleApply}
              canApply={selected !== null && state.phase !== "profiles" && state.phase !== "simulating"}
            />
          )}
        </div>
        {selected && (
          <div className="border-t border-neutral-200 px-4 py-2 text-xs text-neutral-500 dark:border-neutral-700">
            {selected.lat.toFixed(3)}, {selected.lon.toFixed(3)}
          </div>
        )}
      </aside>
    </div>
  );
}
