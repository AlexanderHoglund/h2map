"use client";

import { useTranslations } from "next-intl";
import type { ScenarioInput, ScenarioResult } from "@h2map/corridor-schema";
import { Button } from "@/components/ui/Button";

/**
 * Compact live summary docked on the five input steps: the headline numbers
 * only. The full panel (waterfall, regulatory table, per-year chart) lives
 * in the dedicated Results tab.
 */
export default function ResultsSummary({
  result,
  scenario,
  error,
  onViewFull,
}: {
  result: ScenarioResult | null;
  scenario: ScenarioInput;
  error: string | null;
  onViewFull: () => void;
}) {
  const t = useTranslations("corridor.results");

  if (error || !result) {
    return (
      <div className="border border-amber-300 bg-amber-500/10 p-3 text-xs leading-snug text-amber-800">
        {t("invalid", { message: error ?? "…" })}
      </div>
    );
  }

  const s = result.summary;
  const basis = scenario.flags?.emissionsBasis ?? "combustion";

  return (
    <div className="border border-neutral-300 bg-white p-3">
      <p className="text-xs text-neutral-500" title={t("gapHelp")}>
        {t("gap")}
      </p>
      <p className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums text-brand-deep">
        {fmtUsdM(s.gapPvUsdM)}
      </p>
      <dl className="mt-3 space-y-1.5 border-t border-neutral-200 pt-2 text-xs">
        <Row label={t("perUnit")} value={fmtUsd(s.costPerUnitUsd)} />
        <Row
          label={
            <>
              {t("perTonne")}{" "}
              <span className="bg-neutral-500/10 px-1 py-px text-[10px] text-neutral-700">
                {t(`basisLabel.${basis}`)}
              </span>
            </>
          }
          value={fmtUsd(s.costPerTonneCo2Usd)}
        />
        <Row label={t("green")} value={fmtUsdM(s.greenTotalPvUsdM)} />
        <Row label={t("fossil")} value={fmtUsdM(s.fossilTotalPvUsdM)} />
      </dl>
      <Button size="md" className="mt-3 w-full px-3 py-1.5" onClick={onViewFull}>
        {t("viewFull")} →
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="tabular-nums font-medium">{value}</dd>
    </div>
  );
}

function fmtUsdM(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}m`;
}
function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
