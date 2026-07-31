"use client";

import { useTranslations } from "next-intl";
import ActionRow from "./ActionRow";
import EmissionsPanel from "./EmissionsPanel";
import EnergyPanel from "./EnergyPanel";
import HeatMap from "./HeatMap";
import Waterfall from "./Waterfall";
import type { SimulateResponse } from "../types";

/**
 * Results below the form after a successful run. Code-split via next/dynamic
 * from CalculatorClient so the form is interactive immediately.
 */
export default function ResultsSection({
  response,
  lifetimeYears,
  onCopyLink,
}: {
  response: SimulateResponse;
  lifetimeYears: number;
  onCopyLink?: () => void;
}) {
  const t = useTranslations("calculator.results");
  const { results } = response;
  const annualH2Tons =
    lifetimeYears > 0 ? results.totals.h2Kg / lifetimeYears / 1000 : 0;

  const card =
    "rounded-lg border border-neutral-300 bg-white p-4";

  return (
    <div className="space-y-4">
      {/* Headline */}
      <div className={card}>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              {t("headline.lcoh")}
            </div>
            <div className="tabular-nums">
              <span className="text-4xl font-semibold tracking-tight">
                {results.lcohUsdPerKg.toFixed(2)}
              </span>{" "}
              <span className="text-sm text-neutral-500">
                USD/kg H₂
              </span>
            </div>
          </div>
          <Headline
            label={t("headline.capacityFactor")}
            value={(results.performance.electrolyzerCapacityFactor * 100).toFixed(1)}
            unit="%"
          />
          <Headline
            label={t("headline.fullLoadHours")}
            value={Math.round(
              results.performance.fullLoadHoursPerYear,
            ).toLocaleString("en-US")}
            unit="h/yr"
          />
          <Headline
            label={t("headline.annualH2")}
            value={Math.round(annualH2Tons).toLocaleString("en-US")}
            unit="t/yr"
          />
        </div>
      </div>

      <div className={card}>
        <Waterfall
          decomposition={results.decomposition}
          lcoh={results.lcohUsdPerKg}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className={card}>
          <EnergyPanel results={results} profiles={response.profiles} />
        </div>
        <div className={card}>
          <HeatMap matrix={results.performance.averageDayProfileMw} />
        </div>
      </div>

      <div className={card}>
        <EmissionsPanel results={results} lifetimeYears={lifetimeYears} />
      </div>

      <ActionRow response={response} onCopyLink={onCopyLink} />

      <p className="text-[11px] text-neutral-400">
        {t("meta", {
          version: results.meta.engineVersion,
          mode: results.meta.referenceMode ? t("referenceMode") : t("customMode"),
        })}
      </p>
    </div>
  );
}

function Headline({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <div className="tabular-nums">
        <span className="text-xl font-semibold">{value}</span>{" "}
        <span className="text-xs text-neutral-500">{unit}</span>
      </div>
    </div>
  );
}
