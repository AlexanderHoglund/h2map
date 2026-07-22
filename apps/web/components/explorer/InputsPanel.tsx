"use client";

import type { PvKind, UiConfig, WindKind } from "./types";

interface Props {
  config: UiConfig;
  onChange: (config: UiConfig) => void;
  onApply: () => void;
  canApply: boolean;
}

export default function InputsPanel({ config, onChange, onApply, canApply }: Props) {
  const set = <K extends keyof UiConfig>(key: K, value: UiConfig[K]) =>
    onChange({ ...config, [key]: value });

  return (
    <div className="space-y-4 text-sm">
      <Section title="Solar PV" enabled={config.pvEnabled} onToggle={(v) => set("pvEnabled", v)}>
        <Num label="Capacity (MW)" value={config.pvCapacityMw} onChange={(v) => set("pvCapacityMw", v)} />
        <Select
          label="Mounting"
          value={config.pvKind}
          options={[
            ["pv_fixed", "Fixed, optimal tilt"],
            ["pv_1axis", "1-axis tracking"],
            ["pv_2axis", "2-axis tracking"],
          ]}
          onChange={(v) => set("pvKind", v as PvKind)}
        />
        <Num label="LCOE (USD/MWh)" value={config.pvLcoeUsdPerMwh} onChange={(v) => set("pvLcoeUsdPerMwh", v)} />
      </Section>

      <Section title="Wind" enabled={config.windEnabled} onToggle={(v) => set("windEnabled", v)}>
        <Num label="Capacity (MW)" value={config.windCapacityMw} onChange={(v) => set("windCapacityMw", v)} />
        <Select
          label="Hub height"
          value={config.windKind}
          options={[
            ["wind_120", "120 m"],
            ["wind_160", "160 m"],
          ]}
          onChange={(v) => set("windKind", v as WindKind)}
        />
        <Num label="LCOE (USD/MWh)" value={config.windLcoeUsdPerMwh} onChange={(v) => set("windLcoeUsdPerMwh", v)} />
      </Section>

      <Section title="Grid backup" enabled={config.gridEnabled} onToggle={(v) => set("gridEnabled", v)}>
        <Num label="Max import (MW)" value={config.gridMaxImportMw} onChange={(v) => set("gridMaxImportMw", v)} />
        <Num label="Price (USD/MWh)" value={config.gridPriceUsdPerMwh} onChange={(v) => set("gridPriceUsdPerMwh", v)} />
        <Num
          label="Emission factor (tCO₂/MWh)"
          value={config.gridEfTco2PerMwh}
          step={0.01}
          onChange={(v) => set("gridEfTco2PerMwh", v)}
        />
      </Section>

      <Section title="Electrolyzer" enabled onToggle={undefined}>
        <Num label="Capacity (MW)" value={config.electrolyzerCapacityMw} onChange={(v) => set("electrolyzerCapacityMw", v)} />
        <Num label="CAPEX (USD/kW)" value={config.electrolyzerCapexUsdPerKw} onChange={(v) => set("electrolyzerCapexUsdPerKw", v)} />
        <Num
          label="Efficiency (LHV, %)"
          value={config.efficiencyLhv * 100}
          onChange={(v) => set("efficiencyLhv", v / 100)}
        />
        <Num
          label="Degradation (%/yr)"
          value={config.degradationPerYear * 100}
          step={0.1}
          onChange={(v) => set("degradationPerYear", v / 100)}
        />
        <Num label="Stack life (h)" value={config.stackLifetimeHours} step={1000} onChange={(v) => set("stackLifetimeHours", v)} />
      </Section>

      <Section title="Finance & water" enabled onToggle={undefined}>
        <Num label="Lifetime (years)" value={config.lifetimeYears} onChange={(v) => set("lifetimeYears", v)} />
        <Num
          label="Discount rate (%)"
          value={config.discountRate * 100}
          step={0.5}
          onChange={(v) => set("discountRate", v / 100)}
        />
        <Num
          label="Water price (USD/m³)"
          value={config.waterPriceUsdPerM3}
          step={0.1}
          onChange={(v) => set("waterPriceUsdPerM3", v)}
        />
      </Section>

      <button
        type="button"
        onClick={onApply}
        disabled={!canApply}
        className="w-full rounded-lg bg-blue-600 px-3 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Recalculate
      </button>
      <p className="text-xs text-neutral-500">
        Reference-mode defaults (Motor de Cálculo LCOH, April 2024). LCOE-priced
        renewables; CAPEX pricing mode coming later.
      </p>
    </div>
  );
}

function Section({
  title,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  enabled: boolean;
  onToggle: ((v: boolean) => void) | undefined;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
      <legend className="flex items-center gap-2 px-1 font-medium">
        {onToggle ? (
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => onToggle(e.target.checked)}
              className="accent-blue-600"
            />
            {title}
          </label>
        ) : (
          title
        )}
      </legend>
      <div className={enabled ? "grid grid-cols-2 gap-2" : "hidden"}>{children}</div>
    </fieldset>
  );
}

function Num({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs text-neutral-500">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : ""}
        step={step ?? 1}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-0.5 w-full rounded border border-neutral-300 bg-transparent px-2 py-1 tabular-nums dark:border-neutral-600"
      />
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs text-neutral-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-600 dark:bg-neutral-900"
      >
        {options.map(([v, label_]) => (
          <option key={v} value={v}>
            {label_}
          </option>
        ))}
      </select>
    </label>
  );
}
