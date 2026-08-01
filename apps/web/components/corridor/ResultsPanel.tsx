"use client";

import React, { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ScenarioInput, ScenarioResult } from "@h2map/corridor-schema";
import { DEFAULT_BUNDLE } from "./state";

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
      // The green premium (the gap itself) as its OWN bar, visually distinct
      // from the anchored totals: it spans fossil total -> green total.
      {
        key: "wfGap",
        base: Math.min(s.fossilTotalPvUsdM, s.greenTotalPvUsdM),
        span: Math.abs(s.gapPvUsdM),
        kind: "gap" as const,
      },
    ];
    return steps.map((s2) => ({ ...s2, label: t(s2.key) }));
  }, [result, t]);

  // Per-year rows: each side's annual cost SPLIT BY NATURE (CAPEX / operating
  // / regulation) so a chart can separate the one-off year-1 capital spike
  // from the recurring cost, plus the cumulative discounted gap and its
  // annual increment. A single summed series is unplottable — see the
  // dev-mode dominance guard below.
  const perYear = useMemo(() => {
    if (!result) return [];
    const start = scenario.cargo.startYear;
    const g = result.perYear.green;
    const f = result.perYear.fossil;
    const regOf = (side: typeof g, i: number) =>
      (side.etsUsdM[i] ?? 0) +
      (side.fuelEuUsdM[i] ?? 0) +
      (side.ira45zUsdM[i] ?? 0) +
      (side.selfDesignedUsdM[i] ?? 0) +
      (side.imoNetZeroUsdM?.[i] ?? 0);
    let cum = 0;
    return g.totalUsdM.map((gt, i) => {
      const inc = (g.pvUsdM[i] ?? 0) - (f.pvUsdM[i] ?? 0);
      cum += inc;
      return {
        year: start + i,
        gCapex: round2(g.totalCapexUsdM[i] ?? 0),
        gOpex: round2(g.totalOpexUsdM[i] ?? 0),
        gReg: round2(regOf(g, i)),
        fCapex: round2(f.totalCapexUsdM[i] ?? 0),
        fOpex: round2(f.totalOpexUsdM[i] ?? 0),
        fReg: round2(regOf(f, i)),
        green: round2(gt),
        fossil: round2(f.totalUsdM[i] ?? 0),
        incGap: round2(inc),
        cumGap: round2(cum),
      };
    });
  }, [result, scenario.cargo.startYear]);

  // Chart derivations: the year-1 dominance the charts must communicate, and
  // the offset floor for the cumulative axis (never zero-based when the first
  // point already sits high — spec §2).
  const chartMeta = useMemo(() => {
    if (perYear.length === 0 || !result) return null;
    const y1 = perYear[0]!;
    const last = perYear[perYear.length - 1]!;
    const lifetimeGap = result.summary.gapPvUsdM;
    const cums = perYear.map((r) => r.cumGap);
    const minCum = Math.min(...cums);
    const maxCum = Math.max(...cums);
    // Zero-base the cumulative axis only if the first point is < 20% of the
    // max; otherwise start below it at a round number and flag the break.
    const zeroBased = maxCum <= 0 || minCum / maxCum < 0.2;
    const cumFloor = zeroBased ? 0 : Math.floor(minCum / 100) * 100;
    const cumCeil = Math.ceil(maxCum / 100) * 100;
    return {
      y1Capital: y1.gCapex,
      y1Inc: y1.incGap,
      y1Share: lifetimeGap ? Math.round((y1.incGap / lifetimeGap) * 100) : 0,
      lastYear: last.year,
      lastInc: last.incGap,
      cumFloor,
      cumCeil,
      cumZeroBased: zeroBased,
      firstYear: y1.year,
    };
  }, [perYear, result]);

  // Dev-mode guard (spec §4): a series whose range is set by one outlier must
  // be rendered separated (by nature / series / axis). Both charts below ARE
  // separated, so this never fires for them; it documents the rule and warns
  // if a future chart plots the summed annual series raw. Flip `separated` to
  // false to see it fire on the current data.
  warnIfDominated(
    "annual-cost",
    perYear.flatMap((r) => [r.green, r.fossil]),
    { separated: true },
  );

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
  const netReg = result.reporting.netRegulatoryEffectUsdM;

  // Viz tokens (globals.css): CVD-safe blue-red diverging pair for the deltas,
  // neutral anchored totals (baseline + x-label are the secondary encoding).
  const COLORS = {
    total: "var(--viz-total)",
    up: "var(--viz-delta-up)",
    down: "var(--viz-delta-down)",
    gap: "var(--color-brand-deep)",
  };

  // Cargo-unit identity (presentation): explicit, else vessel-derived.
  const cargoUnit =
    scenario.cargo.unit ??
    (scenario.vessel.typeId.startsWith("container") ? "teu" : "tonne");
  const unitWeight = scenario.cargo.unitWeightTonnes ?? (cargoUnit === "teu" ? 14 : 1);

  const rep = result.reporting;
  const imo =
    rep.imoNetZero && !rep.imoNetZero.notParameterised
      ? (rep.imoNetZero as { green: NonNullable<unknown>; fossil: NonNullable<unknown> } & {
          green: { pvUsdM: number; surplusTonnesCo2e: number };
          fossil: { pvUsdM: number; surplusTonnesCo2e: number };
        })
      : null;
  const imoNotParam = rep.imoNetZero?.notParameterised === true;
  const kpis: {
    label: React.ReactNode;
    value: string;
    sub?: string;
    strong?: boolean;
  }[] = [
    {
      label: t("gap"),
      value: fmtUsdM(s.gapPvUsdM),
      sub: `${fmtUsdM(rep.gapPvPreRegulationUsdM)} ${t("preRegLabel")}`,
      strong: true,
    },
    {
      label: cargoUnit === "teu" ? t("perUnitTeu") : t("perUnitTonne"),
      value: fmtUsd(s.costPerUnitUsd),
      sub: `${fmtUsd(rep.costPerUnitPreRegulationUsd)} ${t("preRegLabel")}`,
    },
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
      sub: `${fmtUsd(rep.costPerTonneCo2PreRegulationUsd)} ${t("preRegLabel")}`,
    },
    { label: t("green"), value: fmtUsdM(s.greenTotalPvUsdM) },
    { label: t("fossil"), value: fmtUsdM(s.fossilTotalPvUsdM) },
    { label: t("co2"), value: `${fmtInt(s.co2AbatedTonnes)} t` },
  ];

  const decompRows: {
    label: string;
    green: number;
    fossil: number | null;
    subtotalAfter?: boolean;
  }[] = [
    { label: t("rowCapex"), green: s.greenCapexPvUsdM, fossil: s.fossilCapexPvUsdM },
    {
      label: t("rowOpex"),
      green: s.greenOpexPvUsdM,
      fossil: s.fossilOpexPvUsdM,
      subtotalAfter: true,
    },
    { label: t("regEts"), green: s.etsGreenPvUsdM, fossil: s.etsFossilPvUsdM },
    { label: t("regFuelEu"), green: s.fuelEuGreenPvUsdM, fossil: s.fuelEuFossilPvUsdM },
    { label: t("regIra"), green: s.ira45zGreenPvUsdM, fossil: null },
    { label: t("regSelf"), green: s.selfDesignedGreenPvUsdM, fossil: s.selfDesignedFossilPvUsdM },
    ...(imo
      ? [{ label: t("regImo"), green: imo.green.pvUsdM, fossil: imo.fossil.pvUsdM }]
      : []),
  ];

  const abatement: { key: string; tonnes: number; active: boolean }[] = div
    ? [
        { key: "combustion", tonnes: div.co2AbatedTonnesCombustion, active: basis === "combustion" },
        { key: "wellToWake", tonnes: div.co2AbatedTonnesWellToWake, active: basis === "wellToWake" },
      ]
    : [{ key: basis, tonnes: s.co2AbatedTonnes, active: true }];

  // Abatement-cost diagram: the premium per tonne of CO2 avoided on each
  // basis, next to a carbon-price reference drawn from ACTIVE schemes only
  // (fix #4): ETS → self-designed → (IMO, when present) → none.
  const reg = scenario.regulation;
  const refPrice: { usdPerTonne: number; label: string; note: string } | null =
    reg.ets.enabled
      ? {
          usdPerTonne: reg.ets.euaEurPerTonne * reg.eurUsd,
          label: t("refEts"),
          note: t("abatementNoteEts"),
        }
      : reg.selfDesigned.enabled
        ? {
            usdPerTonne: reg.selfDesigned.co2PriceUsdPerTonne,
            label: t("refSelf"),
            note: t("abatementNoteSelf"),
          }
        : reg.imoNetZero?.enabled &&
            DEFAULT_BUNDLE.regulationDefaults.imoNetZero
          ? {
              usdPerTonne: DEFAULT_BUNDLE.regulationDefaults.imoNetZero.tier1UsdPerTonneCo2e,
              label: t("refImo"),
              note: t("abatementNoteImo"),
            }
          : null;
  const abatementChart = abatement.map((row) => ({
    name: t(`basisLabel.${row.key}`),
    cost: Math.round(((s.gapPvUsdM * 1e6) / row.tonnes) * 100) / 100,
    active: row.active,
  }));

  const portA = [scenario.cargo.portAName, fmtId(scenario.cargo.countryId)]
    .filter(Boolean)
    .join(", ");
  const portB =
    scenario.cargo.routeType === "point-to-point"
      ? [scenario.cargo.portBName, fmtId(scenario.cargo.countryBId ?? scenario.cargo.countryId)]
          .filter(Boolean)
          .join(", ")
      : null;

  const snapshot: [string, string][] = [
    [t("snapRoute"), fmtId(scenario.cargo.routeType)],
    ["Port A", portA],
    ...(portB ? ([["Port B", portB]] as [string, string][]) : []),
    [
      t("snapUnit"),
      `${cargoUnit === "teu" ? "TEU" : "Tonne"} · ${unitWeight} t`,
    ],
    ...(cargoUnit === "teu"
      ? ([[t("perTonneCargo"), fmtUsd(s.costPerUnitUsd / unitWeight)]] as [string, string][])
      : []),
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
            {k.sub && (
              <p className="mt-0.5 text-[11px] tabular-nums text-neutral-500">
                {k.sub}
              </p>
            )}
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
            {decompRows.map((row) => {
              const delta = row.green - (row.fossil ?? 0);
              return (
                <React.Fragment key={row.label}>
                  <tr className="border-b border-neutral-100 last:border-0">
                    <td className="py-1.5 text-neutral-600">{row.label}</td>
                    <td className="py-1.5 text-right">{fmtUsdM(row.green)}</td>
                    <td className="py-1.5 text-right text-neutral-500">
                      {row.fossil === null ? "—" : fmtUsdM(row.fossil)}
                    </td>
                    <td className="py-1.5 text-right font-medium" style={deltaStyle(delta)}>
                      {fmtSigned(delta)}
                    </td>
                  </tr>
                  {row.subtotalAfter && (
                    <tr className="border-b border-neutral-300 bg-neutral-50 font-medium">
                      <td className="py-1.5">{t("subtotalPreReg")}</td>
                      <td className="py-1.5 text-right">
                        {fmtUsdM(rep.greenPreRegulationPvUsdM)}
                      </td>
                      <td className="py-1.5 text-right text-neutral-500">
                        {fmtUsdM(rep.fossilPreRegulationPvUsdM)}
                      </td>
                      <td className="py-1.5 text-right">
                        {fmtSigned(rep.gapPvPreRegulationUsdM)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
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

      {/* ===== Annual cost — stacked by nature, green vs fossil ===== */}
      <section className="border border-neutral-300 bg-white p-3 lg:col-span-7">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <Eyebrow className="mb-0">
            {t("perYear")}{" "}
            <span className="font-normal normal-case tracking-normal text-neutral-500">
              · {t("unitUsdM")}
            </span>
          </Eyebrow>
          {/* Legend — nature by shade, side by colour family; never colour alone */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-600">
            <span className="text-neutral-500">{t("green")}:</span>
            <LegendSwatch color={NATURE_FILLS.gCapex} label={t("natureCapex")} />
            <LegendSwatch color={NATURE_FILLS.gOpex} label={t("natureOperating")} />
            <span className="text-neutral-500">{t("fossil")}:</span>
            <LegendSwatch color={NATURE_FILLS.fCapex} label={t("natureCapex")} />
            <LegendSwatch color={NATURE_FILLS.fOpex} label={t("natureOperating")} />
            <LegendSwatch color={NATURE_FILLS.reg} label={t("natureRegulation")} />
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={perYear} margin={{ top: 4, right: 14, bottom: 0, left: 0 }} barCategoryGap="16%">
              <CartesianGrid stroke="var(--viz-grid)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: "var(--viz-ink-muted)" }} stroke="var(--viz-baseline)" interval={0} tickMargin={4} />
              <YAxis tick={{ fontSize: 10, fill: "var(--viz-ink-muted)" }} stroke="var(--viz-baseline)" width={46} />
              <Tooltip
                formatter={(v, name) => [
                  typeof v === "number" ? fmtUsdM(v) : String(v),
                  NATURE_NAMES[name as string] ? t(NATURE_NAMES[name as string]!) : String(name),
                ]}
                labelStyle={{ fontSize: 11 }}
                contentStyle={{ fontSize: 11 }}
              />
              <Bar dataKey="gCapex" stackId="green" fill={NATURE_FILLS.gCapex} isAnimationActive={false} />
              <Bar dataKey="gOpex" stackId="green" fill={NATURE_FILLS.gOpex} isAnimationActive={false} />
              <Bar dataKey="gReg" stackId="green" fill={NATURE_FILLS.reg} isAnimationActive={false} />
              <Bar dataKey="fCapex" stackId="fossil" fill={NATURE_FILLS.fCapex} isAnimationActive={false} />
              <Bar dataKey="fOpex" stackId="fossil" fill={NATURE_FILLS.fOpex} isAnimationActive={false} />
              <Bar dataKey="fReg" stackId="fossil" fill={NATURE_FILLS.reg} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {chartMeta && (
          <p className="mt-1 text-[11px] leading-snug text-neutral-500">
            {t("annualYear1Caption", {
              capital: fmtUsdM(chartMeta.y1Capital),
              share: chartMeta.y1Share,
            })}
          </p>
        )}
      </section>

      {/* ===== Cumulative gap — annual increment (bars) + cumulative (line) ===== */}
      <section className="border border-neutral-300 bg-white p-3 lg:col-span-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <Eyebrow className="mb-0">
            {t("cumulative")}{" "}
            <span className="font-normal normal-case tracking-normal text-neutral-500">
              · {t("unitUsdM")}
            </span>
          </Eyebrow>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-600">
            <LegendSwatch color="var(--viz-series-1)" label={t("cumIncrement")} />
            <span className="flex items-center gap-1">
              <span aria-hidden className="h-0.5 w-4" style={{ background: "var(--color-brand-deep)" }} />
              {t("cumTotal")}
            </span>
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={perYear} margin={{ top: 10, right: 6, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--viz-grid)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: "var(--viz-ink-muted)" }} stroke="var(--viz-baseline)" interval={0} tickMargin={4} />
              <YAxis
                yAxisId="inc"
                tick={{ fontSize: 10, fill: "var(--viz-ink-muted)" }}
                stroke="var(--viz-baseline)"
                width={44}
              />
              <YAxis
                yAxisId="cum"
                orientation="right"
                domain={chartMeta ? [chartMeta.cumFloor, chartMeta.cumCeil] : [0, "auto"]}
                tick={{ fontSize: 10, fill: "var(--color-brand-deep)" }}
                stroke="var(--viz-baseline)"
                width={46}
              />
              <Tooltip
                formatter={(v, name) => [
                  typeof v === "number" ? fmtUsdM(v) : String(v),
                  name === "incGap" ? t("cumIncrement") : t("cumTotal"),
                ]}
                labelStyle={{ fontSize: 11 }}
                contentStyle={{ fontSize: 11 }}
              />
              <Bar yAxisId="inc" dataKey="incGap" fill="var(--viz-series-1)" isAnimationActive={false} />
              <Line yAxisId="cum" type="monotone" dataKey="cumGap" stroke="var(--color-brand-deep)" dot={false} strokeWidth={2} isAnimationActive={false} />
              {chartMeta && (
                <ReferenceDot
                  yAxisId="inc"
                  x={chartMeta.firstYear}
                  y={chartMeta.y1Inc}
                  r={3}
                  fill="var(--viz-delta-up)"
                  stroke="var(--viz-surface)"
                  label={{
                    value: t("year1Marker"),
                    position: "top",
                    fontSize: 10,
                    fill: "var(--viz-delta-up)",
                  }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {chartMeta && (
          <p className="mt-1 text-[11px] leading-snug text-neutral-500">
            {t("cumulativeNote", {
              y1inc: fmtUsdM(chartMeta.y1Inc),
              share: chartMeta.y1Share,
              lastYear: chartMeta.lastYear,
              lastInc: fmtUsdM(chartMeta.lastInc),
            })}
            {!chartMeta.cumZeroBased &&
              ` ${t("cumAxisOffset", { floor: fmtUsdM(chartMeta.cumFloor) })}`}
          </p>
        )}
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
                ...(imo
                  ? ([[t("regImo"), imo.green.pvUsdM, imo.fossil.pvUsdM]] as const)
                  : []),
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
        {imo && imo.green.surplusTonnesCo2e > 0 && (
          <p className="mt-2 text-[11px] leading-snug text-neutral-500">
            {t("imoSurplus")}:{" "}
            <span className="tabular-nums font-medium text-neutral-700">
              {fmtInt(imo.green.surplusTonnesCo2e)} tCO2e
            </span>
          </p>
        )}
        {imoNotParam && (
          <p className="mt-2 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-800">
            {t("imoNotParam")}
          </p>
        )}
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

        {/* Abatement cost vs the carbon price */}
        <div className="mt-3 border-t border-neutral-100 pt-3">
          <Eyebrow>{t("abatementChart")}</Eyebrow>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={abatementChart}
                margin={{ top: 12, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid stroke="var(--viz-grid)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--viz-ink-muted)" }} stroke="var(--viz-baseline)" interval={0} />
                <YAxis tick={{ fontSize: 10, fill: "var(--viz-ink-muted)" }} stroke="var(--viz-baseline)" width={44} />
                {refPrice !== null && (
                  <ReferenceLine
                    y={refPrice.usdPerTonne}
                    stroke="var(--viz-delta-up)"
                    strokeDasharray="4 3"
                    label={{
                      value: `${refPrice.label} $${Math.round(refPrice.usdPerTonne)}`,
                      position: "insideTopRight",
                      fontSize: 10,
                      fill: "var(--viz-delta-up)",
                    }}
                  />
                )}
                <Tooltip
                  formatter={(v) => (typeof v === "number" ? `$${v.toLocaleString("en-US")}/t` : String(v))}
                  labelStyle={{ fontSize: 11 }}
                  contentStyle={{ fontSize: 11 }}
                />
                <Bar dataKey="cost" isAnimationActive={false} maxBarSize={56}>
                  {abatementChart.map((row) => (
                    <Cell
                      key={row.name}
                      fill={row.active ? "var(--color-brand)" : "var(--viz-ink-muted)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-neutral-500">
            {refPrice ? refPrice.note : t("abatementNoteNone")}
          </p>
        </div>
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

/** A small filled square + label for chart legends (colour is never the sole cue). */
function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span aria-hidden className="h-2.5 w-2.5" style={{ background: color }} />
      {label}
    </span>
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

/**
 * Cost-nature fills for the annual chart: side identity (green vs fossil)
 * carried by colour family, nature (CAPEX / operating) by shade, and
 * regulation in a shared carbon accent so the fossil charge is visible.
 */
const NATURE_FILLS = {
  gCapex: "#006b00",
  gOpex: "#5cb85c",
  fCapex: "#4c4b48",
  fOpex: "#a6a49d",
  reg: "var(--viz-delta-up)",
} as const;

/** Bar dataKey → nature label message key (for the tooltip). */
const NATURE_NAMES: Record<string, string> = {
  gCapex: "natureCapex",
  gOpex: "natureOperating",
  gReg: "natureRegulation",
  fCapex: "natureCapex",
  fOpex: "natureOperating",
  fReg: "natureRegulation",
};

/**
 * Dev-mode dominance guard (design note: "one outlier ⇒ separated rendering").
 * Warns when a series' max exceeds 5× its median and the chart is NOT using a
 * separated rendering — the signal that the default rendering is wrong. No-op
 * in production and when `separated` is set.
 */
function warnIfDominated(
  label: string,
  series: readonly number[],
  { separated }: { separated: boolean },
): void {
  if (process.env.NODE_ENV === "production" || separated) return;
  const vals = series
    .filter((v) => Number.isFinite(v))
    .map((v) => Math.abs(v))
    .sort((a, b) => a - b);
  if (vals.length < 3) return;
  const median = vals[Math.floor(vals.length / 2)]!;
  const max = vals[vals.length - 1]!;
  if (median > 0 && max > 5 * median) {
    console.warn(
      `[chart:${label}] value range is set by a single outlier ` +
        `(max ${max.toFixed(1)} > 5× median ${median.toFixed(1)}). ` +
        `Separate it out — by cost nature, by series, or by axis — instead of ` +
        `compressing every other point into illegibility.`,
    );
  }
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
