"use client";

import { useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnnualRow, LCOHResults, SimulateResponse } from "../types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Energy panel: monthly average electrolyzer load (row means of the 12×24
 * month-by-hour matrix), per-source curtailment, and profile provenance.
 * NOTE: per-source monthly *generation* is not in the API response, so the
 * monthly chart shows electrolyzer load only.
 */
export default function EnergyPanel({
  results,
  profiles,
}: {
  results: LCOHResults;
  profiles: SimulateResponse["profiles"];
}) {
  const t = useTranslations("calculator.results.energy");

  const monthly = results.performance.averageDayProfileMw.map((row, i) => ({
    month: MONTHS[i] ?? String(i + 1),
    mw: row.length > 0 ? row.reduce((a, b) => a + b, 0) / row.length : 0,
  }));
  const year1 = results.annual[0];

  return (
    <figure>
      <figcaption className="mb-2 text-sm font-semibold">{t("title")}</figcaption>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthly} margin={{ top: 8, right: 8, left: 4, bottom: 0 }} barCategoryGap="25%">
            <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
            <XAxis
              dataKey="month"
              interval={0}
              tickLine={false}
              axisLine={{ stroke: "var(--viz-baseline)" }}
              tick={{ fontSize: 11, fill: "var(--viz-ink-secondary)" }}
              tickFormatter={(m: string, i: number) => (i % 2 === 0 ? m : "")}
            />
            <YAxis
              width={44}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--viz-ink-secondary)" }}
              label={{
                value: "MW",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 11, fill: "var(--viz-ink-muted)" },
              }}
            />
            <Tooltip
              cursor={{ fill: "transparent" }}
              formatter={(value) => [`${Number(value).toFixed(1)} MW`, t("avgLoad")]}
            />
            <Bar dataKey="mw" fill="var(--viz-series-1)" isAnimationActive={false} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="sr-only">
        {t("srSummary")}{" "}
        {monthly.map((m) => `${m.month}: ${m.mw.toFixed(1)} MW`).join(", ")}
      </p>

      {year1 ? (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {profiles.pv ? (
            <CurtailmentTile
              label={t("curtailmentPv")}
              consumedKwh={year1.ePvKwh}
              curtailedKwh={year1.curtailedPvKwh}
              t={t}
            />
          ) : null}
          {profiles.wind ? (
            <CurtailmentTile
              label={t("curtailmentWind")}
              consumedKwh={year1.eWindKwh}
              curtailedKwh={year1.curtailedWindKwh}
              t={t}
            />
          ) : null}
        </div>
      ) : null}

      <Provenance profiles={profiles} />
    </figure>
  );
}

function CurtailmentTile({
  label,
  consumedKwh,
  curtailedKwh,
  t,
}: {
  label: string;
  consumedKwh: AnnualRow["ePvKwh"];
  curtailedKwh: AnnualRow["curtailedPvKwh"];
  t: ReturnType<typeof useTranslations<"calculator.results.energy">>;
}) {
  const generationKwh = consumedKwh + curtailedKwh;
  const pct = generationKwh > 0 ? (curtailedKwh / generationKwh) * 100 : 0;
  return (
    <div className="rounded-md border border-neutral-200 px-3 py-2 text-xs">
      <div className="text-neutral-500">{label}</div>
      <div className="mt-0.5 font-medium tabular-nums">
        {t("curtailmentValue", {
          mwh: Math.round(curtailedKwh / 1000).toLocaleString("en-US"),
          pct: pct.toFixed(1),
        })}
      </div>
    </div>
  );
}

function Provenance({ profiles }: { profiles: SimulateResponse["profiles"] }) {
  const t = useTranslations("calculator.results.energy");
  const lines: string[] = [];
  for (const [slot, p] of Object.entries(profiles)) {
    if (!p) continue;
    const name = slot === "pv" ? t("sourcePv") : t("sourceWind");
    lines.push(
      p.source.type === "resolved"
        ? `${name}: ${p.source.provider} · ${p.source.datasetVersion}`
        : `${name}: ${t("inlineProfile")}`,
    );
  }
  if (lines.length === 0) return null;
  return (
    <p className="mt-3 text-[11px] text-neutral-400">
      {t("provenance")} — {lines.join(" · ")}
    </p>
  );
}
