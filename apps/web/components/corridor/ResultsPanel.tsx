"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ScenarioInput, ScenarioResult } from "@h2map/corridor-schema";

/**
 * The full results report (its own tab): a technical spec-sheet reading of
 * the model — KPI strip, cost-bridge waterfall (Output rows 33–42, hidden
 * float base), green/fossil/Δ decomposition table, annual + cumulative
 * discounted cost charts, regulatory PV table, emissions & abatement on
 * both bases, and the scenario snapshot. Updates on every keystroke — the
 * engine runs client-side.
 */
export default function ResultsPanel({
  result,
  scenario,
  error,
}: {
  result: ScenarioResult | null;
  scenario: ScenarioInput;
  error: string | null;
}) {
  const t = useTranslations("corridor.results");

  const waterfall = useMemo(() => {
    if (!result) return [];
    const s = result.summary;
    const dCapex = s.greenCapexPvUsdM - s.fossilCapexPvUsdM;
    const dOpex = s.greenOpexPvUsdM - s.fossilOpexPvUsdM;
    const greenReg =
      s.etsGreenPvUsdM + s.fuelEuGreenPvUsdM + s.ira45zGreenPvUsdM + s.selfDesignedGreenPvUsdM;
    const fossilReg = s.etsFossilPvUsdM + s.fuelEuFossilPvUsdM + s.selfDesignedFossilPvUsdM;
    const dReg = greenReg - fossilReg;

    // Float bars: [base, span] per step, endpoints anchored at zero
    // (Output!F35:H42's hidden-base construction).
    let run = s.fossilTotalPvUsdM;
    const steps = [
      { key: "wfFossil", base: 0, span: s.fossilTotalPvUsdM, kind: "total" as const },
      ...[
        { key: "wfCapex", delta: dCapex },
        { key: "wfOpex", delta: dOpex },
        { key: "wfReg", delta: dReg },
      ].map(({ key, delta }) => {
        const start = run;
        run += delta;
        return {
          key,
          base: Math.min(start, run),
          span: Math.abs(delta),
          kind: delta >= 0 ? ("up" as const) : ("down" as const),
        };
      }),
      { key: "wfGreen", base: 0, span: s.greenTotalPvUsdM, kind: "total" as const },
    ];
    return steps.map((s2) => ({ ...s2, label: t(s2.key) }));
  }, [result, t]);

  // Per-year rows + the cumulative DISCOUNTED gap (PV columns): how the
  // headline gap accumulates over the corridor's life.
  const perYear = useMemo(() => {
    if (!result) return [];
    const start = scenario.cargo.startYear;
    let cum = 0;
    return result.perYear.green.totalUsdM.map((g, i) => {
      cum +=
        (result.perYear.green.pvUsdM[i] ?? 0) -
        (result.perYear.fossil.pvUsdM[i] ?? 0);
      return {
        year: start + i,
        green: round2(g),
        fossil: round2(result.perYear.fossil.totalUsdM[i] ?? 0),
        cumGap: round2(cum),
      };
    });
  }, [result, scenario.cargo.startYear]);

  if (error || !result) {
    return (
      <div className="border border-amber-300 bg-amber-500/10 p-3 text-xs leading-snug text-amber-800">
        {t("invalid", { message: error ?? "…" })}
      </div>
    );
  }

  const s = result.summary;
  const basis = scenario.flags?.emissionsBasis ?? "combustion";
  const div = result.divergences?.emissionsBasis;
  const netReg =
    s.etsGreenPvUsdM +
    s.fuelEuGreenPvUsdM +
    s.ira45zGreenPvUsdM +
    s.selfDesignedGreenPvUsdM -
    (s.etsFossilPvUsdM + s.fuelEuFossilPvUsdM + s.selfDesignedFossilPvUsdM);

  // Viz tokens (globals.css): CVD-safe blue-red diverging pair for the deltas,
  // neutral anchored totals (baseline + x-label are the secondary encoding).
  const COLORS = {
    total: "var(--viz-total)",
    up: "var(--viz-delta-up)",
    down: "var(--viz-delta-down)",
  };

  const kpis: { label: React.ReactNode; value: string; strong?: boolean }[] = [
    { label: t("gap"), value: fmtUsdM(s.gapPvUsdM), strong: true },
    { label: t("perUnit"), value: fmtUsd(s.costPerUnitUsd) },
    {
      label: (
        <>
          {t("perTonne")}{" "}
          <span className="bg-neutral-500/10 px-1 py-px text-[10px] normal-case tracking-normal text-neutral-700">
            {t(`basisLabel.${basis}`)}
          </span>
        </>
      ),
      value: fmtUsd(s.costPerTonneCo2Usd),
    },
    { label: t("green"), value: fmtUsdM(s.greenTotalPvUsdM) },
    { label: t("fossil"), value: fmtUsdM(s.fossilTotalPvUsdM) },
    { label: t("co2"), value: `${fmtInt(s.co2AbatedTonnes)} t` },
  ];

  const decompRows: { label: string; green: number; fossil: number | null }[] = [
    { label: t("rowCapex"), green: s.greenCapexPvUsdM, fossil: s.fossilCapexPvUsdM },
    { label: t("rowOpex"), green: s.greenOpexPvUsdM, fossil: s.fossilOpexPvUsdM },
    { label: t("regEts"), green: s.etsGreenPvUsdM, fossil: s.etsFossilPvUsdM },
    { label: t("regFuelEu"), green: s.fuelEuGreenPvUsdM, fossil: s.fuelEuFossilPvUsdM },
    { label: t("regIra"), green: s.ira45zGreenPvUsdM, fossil: null },
    { label: t("regSelf"), green: s.selfDesignedGreenPvUsdM, fossil: s.selfDesignedFossilPvUsdM },
  ];

  const abatement: { key: string; tonnes: number; active: boolean }[] = div
    ? [
        { key: "combustion", tonnes: div.co2AbatedTonnesCombustion, active: basis === "combustion" },
        { key: "wellToWake", tonnes: div.co2AbatedTonnesWellToWake, active: basis === "wellToWake" },
      ]
    : [{ key: basis, tonnes: s.co2AbatedTonnes, active: true }];

  const snapshot: [string, string][] = [
    [t("snapCountry"), fmtId(scenario.cargo.countryId)],
    [t("snapRoute"), fmtId(scenario.cargo.routeType)],
    [t("snapDistance"), `${fmtInt(scenario.cargo.oneWayDistanceNm)} nm`],
    [t("snapStart"), String(scenario.cargo.startYear)],
    [t("snapHorizon"), String(scenario.cargo.horizonYears)],
    [t("snapVessels"), String(scenario.cargo.vessels)],
    [t("snapRoundtrips"), String(scenario.cargo.roundtripsPerYear)],
    [t("snapGreenFuel"), `${fmtId(scenario.green.fuelId)} · ${fmtId(scenario.green.sourcing)}`],
    [t("snapFossilFuel"), `${fmtId(scenario.fossil.fuelId)} · ${fmtId(scenario.fossil.sourcing)}`],
    [
      t("snapGreenUse"),
      `${fmtInt(result.intermediates.greenFuelTonnesPerVesselYear)} ${t("unitTPerVesselYr")}`,
    ],
    [
      t("snapFossilUse"),
      `${fmtInt(result.intermediates.fossilFuelTonnesPerVesselYear)} ${t("unitTPerVesselYr")}`,
    ],
    [t("snapCargoLifetime"), fmtInt(s.cargoUnitsLifetime)],
  ];

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
      {/* ===== KPI strip: one pixel-grid box ===== */}
      <div className="grid grid-cols-2 gap-px border border-neutral-300 bg-neutral-300 sm:grid-cols-3 lg:col-span-12 xl:grid-cols-6">
        {kpis.map((k, i) => (
          <div key={i} className="bg-white p-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
              {k.label}
            </p>
            <p
              className={`mt-1 tabular-nums ${
                k.strong
                  ? "text-2xl font-semibold tracking-tight text-brand-deep"
                  : "text-lg font-semibold text-neutral-900"
              }`}
            >
              {k.value}
            </p>
          </div>
        ))}
      </div>

      {/* ===== Cost bridge ===== */}
      <section className="border border-neutral-300 bg-white p-3 lg:col-span-7">
        <Eyebrow>{t("waterfall")}</Eyebrow>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={waterfall} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--viz-grid)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--viz-ink-muted)" }} stroke="var(--viz-baseline)" interval={0} />
              <YAxis tick={{ fontSize: 10, fill: "var(--viz-ink-muted)" }} stroke="var(--viz-baseline)" width={44} unit="" />
              <Tooltip
                formatter={(v, name) =>
                  name === "span" && typeof v === "number" ? [fmtUsdM(v), ""] : null
                }
                labelStyle={{ fontSize: 11 }}
                contentStyle={{ fontSize: 11 }}
              />
              <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
              <Bar dataKey="span" stackId="w" isAnimationActive={false}>
                {waterfall.map((step) => (
                  <Cell key={step.key} fill={COLORS[step.kind]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ===== Decomposition: green | fossil | Δ ===== */}
      <section className="border border-neutral-300 bg-white p-3 lg:col-span-5">
        <Eyebrow>{t("decomposition")}</Eyebrow>
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="border-b border-neutral-300 text-[11px] uppercase tracking-wider text-neutral-500">
              <th className="py-1.5 text-left font-medium" scope="col">
                &nbsp;
              </th>
              <th className="py-1.5 text-right font-medium" scope="col">
                {t("green")}
              </th>
              <th className="py-1.5 text-right font-medium" scope="col">
                {t("fossil")}
              </th>
              <th className="py-1.5 text-right font-medium" scope="col">
                {t("delta")}
              </th>
            </tr>
          </thead>
          <tbody>
            {decompRows.map((r) => {
              const delta = r.green - (r.fossil ?? 0);
              return (
                <tr key={r.label} className="border-b border-neutral-100 last:border-0">
                  <td className="py-1.5 text-neutral-600">{r.label}</td>
                  <td className="py-1.5 text-right">{fmtUsdM(r.green)}</td>
                  <td className="py-1.5 text-right text-neutral-500">
                    {r.fossil === null ? "—" : fmtUsdM(r.fossil)}
                  </td>
                  <td className="py-1.5 text-right font-medium" style={deltaStyle(delta)}>
                    {fmtSigned(delta)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-300 font-semibold">
              <td className="pt-2">{t("rowTotal")}</td>
              <td className="pt-2 text-right">{fmtUsdM(s.greenTotalPvUsdM)}</td>
              <td className="pt-2 text-right">{fmtUsdM(s.fossilTotalPvUsdM)}</td>
              <td className="pt-2 text-right text-brand-deep">{fmtSigned(s.gapPvUsdM)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      {/* ===== Annual cost ===== */}
      <section className="border border-neutral-300 bg-white p-3 lg:col-span-7">
        <div className="mb-2 flex items-center justify-between gap-2">
          <Eyebrow className="mb-0">{t("perYear")}</Eyebrow>
          {/* Legend — color must never be the only series identifier */}
          <div className="flex items-center gap-3 text-[11px] text-neutral-600">
            <span className="flex items-center gap-1">
              <span
                aria-hidden
                className="h-0.5 w-4"
                style={{ background: "var(--viz-series-green)" }}
              />
              {t("green")}
            </span>
            <span className="flex items-center gap-1">
              <span
                aria-hidden
                className="h-0.5 w-4"
                style={{ background: "var(--viz-ink-muted)" }}
              />
              {t("fossil")}
            </span>
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={perYear} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--viz-grid)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: "var(--viz-ink-muted)" }} stroke="var(--viz-baseline)" />
              <YAxis tick={{ fontSize: 10, fill: "var(--viz-ink-muted)" }} stroke="var(--viz-baseline)" width={44} />
              <Tooltip
                formatter={(v) => (typeof v === "number" ? fmtUsdM(v) : String(v))}
                labelStyle={{ fontSize: 11 }}
                contentStyle={{ fontSize: 11 }}
              />
              <Line type="monotone" dataKey="green" stroke="var(--viz-series-green)" dot={false} strokeWidth={2} isAnimationActive={false} />
              <Line type="monotone" dataKey="fossil" stroke="var(--viz-ink-muted)" dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ===== Cumulative discounted gap ===== */}
      <section className="border border-neutral-300 bg-white p-3 lg:col-span-5">
        <Eyebrow>{t("cumulative")}</Eyebrow>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={perYear} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--viz-grid)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: "var(--viz-ink-muted)" }} stroke="var(--viz-baseline)" />
              <YAxis tick={{ fontSize: 10, fill: "var(--viz-ink-muted)" }} stroke="var(--viz-baseline)" width={44} />
              <ReferenceLine y={0} stroke="var(--viz-baseline)" />
              <Tooltip
                formatter={(v) => (typeof v === "number" ? fmtUsdM(v) : String(v))}
                labelStyle={{ fontSize: 11 }}
                contentStyle={{ fontSize: 11 }}
              />
              <Line type="monotone" dataKey="cumGap" stroke="var(--viz-series-1)" dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-neutral-500">{t("cumulativeNote")}</p>
      </section>

      {/* ===== Regulatory table ===== */}
      <section className="border border-neutral-300 bg-white p-3 lg:col-span-4">
        <Eyebrow>{t("regTable")}</Eyebrow>
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="border-b border-neutral-300 text-[11px] uppercase tracking-wider text-neutral-500">
              <th className="py-1.5 text-left font-medium" scope="col">
                &nbsp;
              </th>
              <th className="py-1.5 text-right font-medium" scope="col">
                {t("green")}
              </th>
              <th className="py-1.5 text-right font-medium" scope="col">
                {t("fossil")}
              </th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                [t("regEts"), s.etsGreenPvUsdM, s.etsFossilPvUsdM],
                [t("regFuelEu"), s.fuelEuGreenPvUsdM, s.fuelEuFossilPvUsdM],
                [t("regIra"), s.ira45zGreenPvUsdM, null],
                [t("regSelf"), s.selfDesignedGreenPvUsdM, s.selfDesignedFossilPvUsdM],
              ] as const
            ).map(([label, g, f]) => (
              <tr key={label} className="border-b border-neutral-100 last:border-0">
                <td className="py-1.5 text-neutral-600">{label}</td>
                <td className="py-1.5 text-right">{fmtUsdM(g)}</td>
                <td className="py-1.5 text-right text-neutral-500">
                  {f === null ? "—" : fmtUsdM(f)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-300 font-semibold">
              <td className="pt-2">{t("netReg")}</td>
              <td colSpan={2} className="pt-2 text-right" style={deltaStyle(netReg)}>
                {fmtSigned(netReg)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      {/* ===== Emissions & abatement, both bases ===== */}
      <section className="border border-neutral-300 bg-white p-3 lg:col-span-4">
        <Eyebrow>{t("emissions")}</Eyebrow>
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="border-b border-neutral-300 text-[11px] uppercase tracking-wider text-neutral-500">
              <th className="py-1.5 text-left font-medium" scope="col">
                &nbsp;
              </th>
              <th className="py-1.5 text-right font-medium" scope="col">
                {t("abated")}
              </th>
              <th className="py-1.5 text-right font-medium" scope="col">
                {t("abatementCost")}
              </th>
            </tr>
          </thead>
          <tbody>
            {abatement.map((row) => (
              <tr key={row.key} className="border-b border-neutral-100 last:border-0">
                <td className="py-1.5 text-neutral-600">
                  {t(`basisLabel.${row.key}`)}
                  {row.active && (
                    <span className="ml-1.5 bg-brand-tint px-1 py-px text-[10px] font-medium text-brand-deep">
                      {t("activeBasis")}
                    </span>
                  )}
                </td>
                <td className="py-1.5 text-right">{fmtInt(row.tonnes)} t</td>
                <td className="py-1.5 text-right font-medium">
                  {fmtUsd((s.gapPvUsdM * 1e6) / row.tonnes)}/t
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ===== Scenario snapshot ===== */}
      <section className="border border-neutral-300 bg-white p-3 lg:col-span-4">
        <Eyebrow>{t("snapshot")}</Eyebrow>
        <dl className="text-xs">
          {snapshot.map(([label, value]) => (
            <div
              key={label}
              className="flex items-baseline justify-between gap-3 border-b border-neutral-100 py-1.5 last:border-0"
            >
              <dt className="text-neutral-600">{label}</dt>
              <dd className="text-right font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function Eyebrow({
  children,
  className = "mb-2",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`text-[11px] font-semibold uppercase tracking-wider text-neutral-500 ${className}`}
    >
      {children}
    </p>
  );
}

/** Δ colors reuse the CVD-safe waterfall pair; near-zero stays neutral. */
function deltaStyle(delta: number): React.CSSProperties | undefined {
  if (Math.abs(delta) < 0.005) return undefined;
  return { color: delta > 0 ? "var(--viz-delta-up)" : "var(--viz-delta-down)" };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function fmtUsdM(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}m`;
}
function fmtSigned(n: number): string {
  return `${n > 0 ? "+" : ""}${fmtUsdM(n)}`;
}
function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
/** Readable form of a benchmark id ("e-ammonia", "build-here"). */
function fmtId(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}
