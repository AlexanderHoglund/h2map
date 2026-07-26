"use client";

import { useTranslations } from "next-intl";
import type { LCOHResults } from "../types";

/** Emissions panel: intensity, annual absolute emissions, grid share. */
export default function EmissionsPanel({
  results,
  lifetimeYears,
}: {
  results: LCOHResults;
  lifetimeYears: number;
}) {
  const t = useTranslations("calculator.results.emissions");
  const { totals, annual } = results;
  const zero = totals.emissionsTco2e === 0;
  const annualTco2e = lifetimeYears > 0 ? totals.emissionsTco2e / lifetimeYears : 0;
  const gridKwh = annual.reduce((sum, row) => sum + row.eGridKwh, 0);
  const gridShare = totals.eConsumedKwh > 0 ? (gridKwh / totals.eConsumedKwh) * 100 : 0;
  const matched = results.performance.renewableMatchedFraction * 100;

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{t("title")}</h3>
      {zero ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          {t("fullyRenewable")}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Tile
            label={t("intensity")}
            value={totals.emissionsKgCo2ePerKgH2.toFixed(2)}
            unit="kgCO₂e/kg H₂"
          />
          <Tile
            label={t("annual")}
            value={Math.round(annualTco2e).toLocaleString("en-US")}
            unit="tCO₂e/yr"
          />
          <Tile label={t("gridShare")} value={gridShare.toFixed(1)} unit="%" />
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 text-xs text-neutral-500 dark:text-neutral-400">
        <span>
          {t("matched")}:{" "}
          <span className="tabular-nums font-medium text-neutral-700 dark:text-neutral-300">
            {matched.toFixed(1)}%
          </span>
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-neutral-500 dark:text-neutral-400">
        {t("scopeNote")}
      </p>
    </div>
  );
}

function Tile({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-md border border-neutral-200 px-3 py-2 dark:border-neutral-800">
      <div className="text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
      <div className="mt-0.5 tabular-nums">
        <span className="text-lg font-semibold">{value}</span>{" "}
        <span className="text-xs text-neutral-400 dark:text-neutral-500">{unit}</span>
      </div>
    </div>
  );
}
