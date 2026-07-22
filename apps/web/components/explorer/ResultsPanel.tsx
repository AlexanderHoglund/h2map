"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SimulationState } from "./useSimulation";

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

const COMPONENT_LABELS: Record<string, string> = {
  electricityPv: "PV electricity",
  electricityWind: "Wind electricity",
  electricityGrid: "Grid electricity",
  electrolyzerCapex: "Electrolyzer CAPEX",
  stackReplacements: "Stack replacements",
  electrolyzerOpex: "Electrolyzer OPEX",
  water: "Water",
};

export default function ResultsPanel({ state }: { state: SimulationState }) {
  if (state.phase === "idle") {
    return (
      <p className="text-sm text-neutral-500">
        Click anywhere on the map to estimate the levelized cost of hydrogen
        from local wind and solar resources.
      </p>
    );
  }

  if (state.phase === "profiles" || state.phase === "simulating") {
    return (
      <div className="space-y-3 text-sm">
        {state.profileStatuses.map((s) => (
          <div key={s.kind} className="flex items-center gap-2">
            <StatusDot state={s.state} />
            <span>
              {s.kind} profile:{" "}
              {s.state === "building" && "building (first visit to an area takes a minute; cached afterwards)"}
              {s.state === "ready" && `ready (${s.provider}${s.cacheHit ? ", cached" : ", freshly built"})`}
              {s.state === "error" && (s.message ?? "failed")}
            </span>
          </div>
        ))}
        {state.phase === "simulating" && (
          <div className="flex items-center gap-2">
            <StatusDot state="building" />
            <span>running simulation…</span>
          </div>
        )}
      </div>
    );
  }

  if (state.phase === "error" || !state.response) {
    return (
      <div className="space-y-2 text-sm">
        {state.profileStatuses
          .filter((s) => s.state === "error")
          .map((s) => (
            <p key={s.kind} className="text-red-600">
              {s.kind}: {s.message}
            </p>
          ))}
        <p className="rounded border border-red-200 bg-red-50 p-3 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {state.error ?? "Something went wrong"}
        </p>
      </div>
    );
  }

  const { results, profiles } = state.response;
  const decomposition = Object.entries(results.decomposition).filter(
    ([, v]) => v > 1e-9,
  );
  const maxComponent = Math.max(...decomposition.map(([, v]) => v));
  const monthly = results.performance.averageDayProfileMw.map((day, m) => ({
    month: MONTHS[m],
    mw: Number((day.reduce((a, b) => a + b, 0) / day.length).toFixed(1)),
  }));
  const lowFidelity = [profiles.pv?.source, profiles.wind?.source].some(
    (s) =>
      s?.type === "resolved" &&
      (s.provider === "open-meteo-crude" || s.provider === "nasa-power"),
  );
  const attributions = [
    ...new Set(
      [profiles.pv?.source, profiles.wind?.source]
        .map((s) => (s?.type === "resolved" ? s.attribution : null))
        .filter(Boolean) as string[],
    ),
  ];

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs uppercase tracking-wide text-neutral-500">
          Levelized cost of hydrogen
        </div>
        <div className="mt-1 text-4xl font-semibold">
          {results.lcohUsdPerKg.toFixed(2)}
          <span className="ml-1 text-base font-normal text-neutral-500">USD/kg</span>
        </div>
      </div>

      {lowFidelity && (
        <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          ⚠ A fallback data source was used for this location (lower fidelity —
          see provenance below).
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <Tile label="Capacity factor" value={`${(results.performance.electrolyzerCapacityFactor * 100).toFixed(0)} %`} />
        <Tile label="Full-load hours" value={results.performance.fullLoadHoursPerYear.toFixed(0)} />
        <Tile label="kgCO₂e / kgH₂" value={results.totals.emissionsKgCo2ePerKgH2.toFixed(2)} />
      </div>

      <div>
        <h3 className="text-sm font-medium">Cost decomposition (USD/kg)</h3>
        <div className="mt-2 space-y-1.5">
          {decomposition.map(([key, value]) => (
            <div key={key} className="grid grid-cols-[9rem_1fr_3rem] items-center gap-2 text-xs">
              <span className="truncate text-neutral-600 dark:text-neutral-400">
                {COMPONENT_LABELS[key] ?? key}
              </span>
              <div className="h-3.5">
                <div
                  className="h-full rounded-r"
                  style={{
                    width: `${Math.max(2, (value / maxComponent) * 100)}%`,
                    background: "var(--viz-series-1)",
                  }}
                />
              </div>
              <span className="text-right tabular-nums">{value.toFixed(2)}</span>
            </div>
          ))}
        </div>
        <p className="mt-1 text-right text-xs text-neutral-500">
          components sum exactly to {results.lcohUsdPerKg.toFixed(2)}
        </p>
      </div>

      <div>
        <h3 className="text-sm font-medium">Average electrolyzer load by month (MW)</h3>
        <div className="mt-2 h-36">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly} margin={{ top: 4, right: 4, bottom: 0, left: -18 }} barCategoryGap="12%">
              <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={{ stroke: "var(--viz-baseline)" }}
                tick={{ fill: "var(--viz-ink-muted)", fontSize: 10 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--viz-ink-muted)", fontSize: 10 }}
              />
              <Tooltip
                cursor={{ fill: "var(--viz-grid)", opacity: 0.5 }}
                contentStyle={{
                  background: "var(--viz-surface)",
                  border: "1px solid var(--viz-grid)",
                  borderRadius: 6,
                  fontSize: 12,
                  color: "var(--viz-ink)",
                }}
                formatter={(value) => [`${value} MW`, "avg load"]}
              />
              <Bar dataKey="mw" fill="var(--viz-series-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <details className="text-xs text-neutral-500">
        <summary className="cursor-pointer font-medium text-neutral-600 dark:text-neutral-400">
          Data provenance
        </summary>
        <ul className="mt-2 space-y-1">
          {(["pv", "wind"] as const).map((slot) => {
            const src = profiles[slot]?.source;
            if (!src || src.type !== "resolved") return null;
            return (
              <li key={slot}>
                {slot}: {src.provider} · {src.datasetVersion} · cell ({src.latR},{" "}
                {src.lonR}){src.cacheHit ? " · cached" : ""}
              </li>
            );
          })}
          {attributions.map((a) => (
            <li key={a}>{a}</li>
          ))}
          <li>
            Engine v{results.meta.engineVersion}
            {results.meta.referenceMode ? " · reference mode" : ""}
          </li>
        </ul>
      </details>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 px-2 py-2 dark:border-neutral-700">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[10px] text-neutral-500">{label}</div>
    </div>
  );
}

function StatusDot({ state }: { state: string }) {
  const color =
    state === "ready"
      ? "bg-emerald-500"
      : state === "error"
        ? "bg-red-500"
        : "bg-blue-500 animate-pulse";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
}
