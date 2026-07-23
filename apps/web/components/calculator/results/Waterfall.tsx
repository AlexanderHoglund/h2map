"use client";

import { useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LCOHDecomposition } from "../types";

interface Row {
  key: string;
  label: string;
  value: number;
  offset: number;
  pct: number;
  isTotal: boolean;
}

/**
 * Cost waterfall: floating bars via an invisible offset series stacked under
 * the value series. Components (blue) sum visibly to the TOTAL bar (muted).
 */
export default function Waterfall({
  decomposition,
  lcoh,
}: {
  decomposition: LCOHDecomposition;
  lcoh: number;
}) {
  const t = useTranslations("calculator.results.waterfall");

  const components: [string, number][] = [
    ["pv", decomposition.electricityPv],
    ["wind", decomposition.electricityWind],
    ["grid", decomposition.electricityGrid],
    ["capex", decomposition.electrolyzerCapex],
    ["stack", decomposition.stackReplacements],
    ["opex", decomposition.electrolyzerOpex],
    ["water", decomposition.water],
  ];

  const rows: Row[] = [];
  let running = 0;
  for (const [key, value] of components) {
    if (Math.abs(value) < 1e-9) continue;
    rows.push({
      key,
      label: t(`labels.${key}`),
      value,
      offset: running,
      pct: lcoh > 0 ? (value / lcoh) * 100 : 0,
      isTotal: false,
    });
    running += value;
  }
  rows.push({
    key: "total",
    label: t("labels.total"),
    value: lcoh,
    offset: 0,
    pct: 100,
    isTotal: true,
  });

  return (
    <figure>
      <figcaption className="mb-2 text-sm font-semibold">{t("title")}</figcaption>
      <div className="h-75">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 28, right: 8, left: 4, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
            <XAxis
              dataKey="label"
              interval={0}
              tickLine={false}
              axisLine={{ stroke: "var(--viz-baseline)" }}
              tick={{ fontSize: 11, fill: "var(--viz-ink-secondary)" }}
            />
            <YAxis
              width={52}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--viz-ink-secondary)" }}
              label={{
                value: t("axisY"),
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 11, fill: "var(--viz-ink-muted)" },
              }}
            />
            <Tooltip cursor={{ fill: "transparent" }} content={<WaterfallTip />} />
            <Bar dataKey="offset" stackId="w" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="value" stackId="w" isAnimationActive={false} radius={[3, 3, 0, 0]}>
              {rows.map((r) => (
                <Cell
                  key={r.key}
                  fill={r.isTotal ? "var(--viz-ink-muted)" : "var(--viz-series-1)"}
                />
              ))}
              <LabelList content={<BarLabel rows={rows} />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="sr-only">
        {t("srSummary", { total: lcoh.toFixed(2) })}{" "}
        {rows
          .filter((r) => !r.isTotal)
          .map((r) => `${r.label}: ${r.value.toFixed(2)} USD/kg (${r.pct.toFixed(0)}%)`)
          .join(", ")}
      </p>
    </figure>
  );
}

/** Two-line direct label: USD/kg on top, % share underneath. */
function BarLabel(props: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  index?: number;
  rows?: Row[];
}) {
  const { x, y, width, index, rows } = props;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    index === undefined ||
    !rows
  ) {
    return null;
  }
  const row = rows[index];
  if (!row) return null;
  const cx = x + width / 2;
  return (
    <text textAnchor="middle" fill="var(--viz-ink-secondary)">
      <tspan x={cx} y={y - 18} fontSize={11} fontWeight={600}>
        {row.value.toFixed(2)}
      </tspan>
      <tspan x={cx} y={y - 6} fontSize={9.5} fill="var(--viz-ink-muted)">
        {row.pct.toFixed(0)}%
      </tspan>
    </text>
  );
}

function WaterfallTip(props: {
  active?: boolean;
  payload?: ReadonlyArray<{ dataKey?: string | number; payload?: Row }>;
}) {
  const { active, payload } = props;
  const row = payload?.find((p) => p.dataKey === "value")?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <div className="font-medium">{row.label}</div>
      <div className="tabular-nums text-neutral-500 dark:text-neutral-400">
        {row.value.toFixed(3)} USD/kg · {row.pct.toFixed(1)}%
      </div>
    </div>
  );
}
