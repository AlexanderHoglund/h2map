"use client";

import React, { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  ResolvedScenario,
  ScenarioInput,
  ScenarioResult,
} from "@h2map/corridor-schema";
import { buildCostBridge, withFunding } from "@h2map/corridor-engine";
import { formatSig } from "@h2map/units";
import { Card } from "@/components/ui/Card";
import { Note, SectionLabel, Stat, ValueChip } from "@/components/ui/Stat";
import {
  idLabel,
  int,
  round2,
  usd,
  usdM,
  usdMShort,
  usdMSigned,
} from "@/lib/corridor/format";
import { DEFAULT_BUNDLE } from "./state";
import { TabRow, TabTable } from "./results/tables";
import {
  deltaStyle,
  LegendSwatch,
  NATURE_FILLS,
  NATURE_NAMES,
  WaterfallChart,
  GRID_PROPS,
  X_AXIS_PROPS,
  Y_AXIS_PROPS,
} from "./results/charts";
import type { WfStep } from "./results/charts";
import { warnIfDominated } from "./results/guard";
import { ElasticitySection } from "./results/elasticity";
import { ProbabilisticSection } from "./results/probabilistic";

/**
 * The full results report (its own tab), in two bands: RESULTS & DIAGRAMS
 * first — KPI strip, scenario snapshot strip, cost-bridge waterfall (Output
 * rows 33–42, hidden float base) + green/fossil/Δ decomposition table,
 * annual cost chart + carbon-intensity-vs-rules chart — then RESULTS BY
 * TAB: one equal-framed card per input step (cargo, vessel, fuel, port,
 * regulation incl. abatement cost & the carbon-price reference). Updates
 * on every keystroke — the engine runs client-side.
 */
export default function ResultsPanel({
  result,
  scenario,
  resolved,
  error,
  errorNav,
}: {
  result: ScenarioResult | null;
  scenario: ScenarioInput;
  resolved: ResolvedScenario | null;
  error: string | null;
  /** Where the blocking fault lives — names the tab and jumps to it. */
  errorNav?: { label: string; onGo: () => void };
}) {
  const t = useTranslations("corridor.results");
  const ts = useTranslations("corridor.steps");
  const tc = useTranslations("corridor.cargo");
  const tReg = useTranslations("corridor.regulation");

  const waterfall = useMemo(() => {
    if (!result) return { pv: [], perTonne: [] };
    const s = result.summary;
    // The MMMCZCS stylized breakdown. The arithmetic lives in the ENGINE
    // (`buildCostBridge`) rather than here, because the closure - that every
    // block sums back to the headline gap - is only testable there. This
    // component now only lays the blocks out.
    //
    // Two stopping points are drawn: GROSS INCREMENTAL (the corridor under
    // regulation in force today) and NET INCREMENTAL (adding instruments
    // still being tested). The third, value-chain allocation, is not drawn:
    // those quantities do not exist in the engine yet.
    // The funding split rides on top: it allocates the headline gap rather
    // than composing it, so it needs the SCENARIO (willingness to pay is an
    // input) and must never feed back into the cost bars.
    const bridge = withFunding(
      buildCostBridge(result),
      result,
      scenario.commercial?.willingnessToPayUsdPerTonneCo2,
    );

    const anchored = (v: number) => ({ base: Math.min(0, v), span: Math.abs(v) });
    /** A float spanning two running levels; sign lives in fill AND label. */
    const float = (
      from: number,
      to: number,
      scale: number,
      fmt: (n: number) => string,
    ) => {
      const d = to - from;
      return {
        base: Math.min(from, to) * scale,
        span: Math.abs(d) * scale,
        // Direction is now in the FILL, not only the label: an instrument
        // that widens the gap must not read the same as one that closes it.
        kind: d > 0 ? ("increase" as const) : ("reduction" as const),
        labelText: `${d > 0 ? "+" : d < 0 ? "−" : ""}${fmt(Math.abs(d) * scale)}`,
        exitLevel: to * scale,
      };
    };

    const mk = (scale: number, fmt: (n: number) => string) => {
      const anchor = (key: string, v: number) => ({
        key,
        ...anchored(v * scale),
        kind: "incremental" as const,
        labelText: fmt(v * scale),
        exitLevel: v * scale,
      });

      /**
       * One bar per STOP, not per instrument. Six instruments produce six
       * slivers that answer a question nobody asked; the reader wants "what
       * does regulation do to this corridor". The per-instrument parts ride
       * along on the datum so the tooltip can break them out, and the
       * decomposition table below the chart already lists them in full.
       */
      const regBars = bridge.groups.reduce<{
        bars: Omit<WfStep, "label">[];
        level: number;
      }>(
        (acc, g) => {
          const to = acc.level + g.deltaUsdM;
          return {
            bars: [
              ...acc.bars,
              {
                key: `wfGroup_${g.key}`,
                ...float(acc.level, to, scale, fmt),
                // Inactive instruments are still listed, marked as such, so
                // "does not apply here" never reads as "not modelled".
                parts: g.parts.map((p) => ({
                  key: p.key,
                  label: t(`wf_${p.key}`),
                  text:
                    p.deltaUsdM === 0
                      ? t("wfInactive")
                      : `${p.deltaUsdM > 0 ? "+" : "−"}${fmt(Math.abs(p.deltaUsdM) * scale)}`,
                })),
              },
            ],
            level: to,
          };
        },
        { bars: [], level: bridge.grossUsdM },
      );

      return [
        {
          key: "wfGreenTotal",
          ...anchored(bridge.greenTotalUsdM * scale),
          kind: "greenTotal" as const,
          labelText: fmt(bridge.greenTotalUsdM * scale),
          exitLevel: bridge.greenTotalUsdM * scale,
        },
        {
          key: "wfFossilTotal",
          // Hangs from the green total's top down to the gross level.
          base: (bridge.greenTotalUsdM - bridge.fossilTotalUsdM) * scale,
          span: bridge.fossilTotalUsdM * scale,
          kind: "fossilTotal" as const,
          labelText: fmt(bridge.fossilTotalUsdM * scale),
          exitLevel: bridge.grossUsdM * scale,
        },
        anchor("wfGross", bridge.grossUsdM),
        // Regulation as ONE bar, then financing as its own.
        ...regBars.bars,
        anchor("wfIncremental", bridge.incrementalUsdM),
        // THE FUNDING SPLIT — who pays the cost above, drawn only when a
        // willingness to pay is set. These do NOT reduce the incremental
        // cost: they allocate it. Public support is the residual.
        ...(bridge.funding
          ? [
              float(
                bridge.funding.incrementalUsdM,
                bridge.funding.publicSupportUsdM,
                scale,
                fmt,
              ),
              anchor("wfPublicSupport", bridge.funding.publicSupportUsdM),
            ].map((b, i) => ({
              ...b,
              key: i === 0 ? "wfCargoOwner" : "wfPublicSupport",
            }))
          : []),
      ].map((s2) => ({ ...s2, label: t(s2.key) }));
    };

    // The same blocks in two denominations: PV $m, and abatement cost
    // per tonne of CO2 (every step over the same lifetime abatement, so
    // the waterfall identities carry over unchanged).
    const abated = s.co2AbatedTonnes;
    return {
      pv: mk(1, usdMShort),
      perTonne:
        abated > 0 ? mk(1e6 / abated, (n) => usd(n)) : [],
    };
  }, [result, scenario.commercial?.willingnessToPayUsdPerTonneCo2, t]);

  // Per-year rows: each side's annual cost SPLIT BY NATURE (CAPEX / operating
  // / regulation) so the annual chart can separate the one-off year-1 capital
  // spike from the recurring cost. A single summed series is unplottable —
  // see the dev-mode dominance guard below.
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
      (side.imoNetZeroUsdM?.[i] ?? 0) +
      (side.financingUsdM?.[i] ?? 0);
    return g.totalUsdM.map((gt, i) => ({
      year: start + i,
      gCapex: round2(g.totalCapexUsdM[i] ?? 0),
      gOpex: round2(g.totalOpexUsdM[i] ?? 0),
      gReg: round2(regOf(g, i)),
      fCapex: round2(f.totalCapexUsdM[i] ?? 0),
      fOpex: round2(f.totalOpexUsdM[i] ?? 0),
      fReg: round2(regOf(f, i)),
      green: round2(gt),
      fossil: round2(f.totalUsdM[i] ?? 0),
    }));
  }, [result, scenario.cargo.startYear]);

  // Annual-chart caption: the year-1 dominance the chart must communicate.
  const chartMeta = useMemo(() => {
    if (perYear.length === 0 || !result) return null;
    const y1 = perYear[0]!;
    const lifetimeGap = result.summary.gapPvUsdM;
    const y1Inc =
      (result.perYear.green.pvUsdM[0] ?? 0) - (result.perYear.fossil.pvUsdM[0] ?? 0);
    return {
      y1Capital: y1.gCapex,
      y1Share: lifetimeGap ? Math.round((y1Inc / lifetimeGap) * 100) : 0,
    };
  }, [perYear, result]);


  // Dev-mode guard (spec §4): check EVERY series a chart plots, not just the
  // first. A series whose range is set by one outlier must be rendered
  // separated (by nature / series / axis) or dropped.
  //  - annual-cost: the axis-setting summed series is rendered separated
  //    (stacked by cost nature) → separated: true, never fires.
  //  - emissions/abatement: pre/post $-per-tonne per basis — same order of
  //    magnitude by construction; checked where the data is built below.
  warnIfDominated(
    "annual-cost",
    perYear.flatMap((r) => [r.green, r.fossil]),
    { separated: true },
  );

  if (error || !result) {
    return (
      <Note bordered className="p-3">
        {t("invalid", { message: error ?? "…" })}
        {errorNav ? (
          <button
            type="button"
            onClick={errorNav.onGo}
            className="ml-2 font-medium underline"
          >
            {t("invalidGo", { tab: errorNav.label })}
          </button>
        ) : null}
      </Note>
    );
  }

  const s = result.summary;
  const basis = scenario.flags?.emissionsBasis ?? "combustion";
  const div = result.divergences?.emissionsBasis;
  const netReg = result.reporting.netRegulatoryEffectUsdM;

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
    /** "warn" renders the sub-line amber — a caveat, not a comparison. */
    subTone?: "warn";
    strong?: boolean;
  }[] = [
    {
      label: t("gap"),
      value: usdM(s.gapPvUsdM),
      sub: `${usdM(rep.gapPvPreRegulationUsdM)} ${t("preRegLabel")}`,
      strong: true,
    },
    {
      label: cargoUnit === "teu" ? t("perUnitTeu") : t("perUnitTonne"),
      value: usd(s.costPerUnitUsd),
      sub: `${usd(rep.costPerUnitPreRegulationUsd)} ${t("preRegLabel")}`,
    },
    {
      label: (
        <>
          {t("perTonne")}{" "}
          <ValueChip>
            {t(`basisLabel.${basis}`)}
          </ValueChip>{" "}
          <ValueChip>
            {t(
              `frameworkLabel.${scenario.regulation.emissions?.framework ?? "legacy"}`,
            )}
          </ValueChip>
        </>
      ),
      value: usd(s.costPerTonneCo2Usd),
      sub: `${usd(rep.costPerTonneCo2PreRegulationUsd)} ${t("preRegLabel")}`,
    },
    { label: t("green"), value: usdM(s.greenTotalPvUsdM) },
    { label: t("fossil"), value: usdM(s.fossilTotalPvUsdM) },
    {
      label: t("co2"),
      value: `${formatSig(s.co2AbatedTonnes)} t`,
      // The abated figure IS the mass comparison, so the caveat belongs on
      // it, not only in the Energy card.
      ...(result.energyParity.diverged
        ? {
            sub: t("energyParityKpiSub", {
              pct: Math.abs(result.energyParity.divergence! * 100).toFixed(0),
            }),
            subTone: "warn" as const,
          }
        : {}),
    },
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
    // Sprint 4 — the financing effect: green-only, post-subtotal (it is
    // excluded from the pre-regulation cut by design).
    ...(s.financingGreenPvUsdM !== undefined
      ? [{ label: t("regFinancing"), green: s.financingGreenPvUsdM, fossil: null }]
      : []),
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
  // Emissions & abatement diagram: the $-per-tonne premium on each emissions
  // basis, BEFORE and AFTER the regulation modules, against the active
  // scheme's carbon price as a reference line. Same-magnitude series by
  // construction (pre vs post share the tonnes denominator).
  const abatementDiagram = abatement.map((row) => ({
    name: t(`basisLabel.${row.key}`),
    pre: Math.round(((rep.gapPvPreRegulationUsdM * 1e6) / row.tonnes) * 100) / 100,
    post: Math.round(((s.gapPvUsdM * 1e6) / row.tonnes) * 100) / 100,
    active: row.active,
  }));
  warnIfDominated(
    "abatement",
    abatementDiagram.flatMap((r) => [r.pre, r.post]),
    { separated: false },
  );

  const portA = [scenario.cargo.portAName, idLabel(scenario.cargo.countryId)]
    .filter(Boolean)
    .join(", ");
  const portB =
    scenario.cargo.routeType === "point-to-point"
      ? [scenario.cargo.portBName, idLabel(scenario.cargo.countryBId ?? scenario.cargo.countryId)]
          .filter(Boolean)
          .join(", ")
      : null;

  const snapshot: [string, string][] = [
    [t("snapRoute"), idLabel(scenario.cargo.routeType)],
    [t("snapPortA"), portA],
    ...(portB ? ([[t("snapPortB"), portB]] as [string, string][]) : []),
    [
      t("snapUnit"),
      `${cargoUnit === "teu" ? "TEU" : "Tonne"} · ${unitWeight} t`,
    ],
    ...(cargoUnit === "teu"
      ? ([[t("perTonneCargo"), usd(s.costPerUnitUsd / unitWeight)]] as [string, string][])
      : []),
    [t("snapDistance"), `${int(scenario.cargo.oneWayDistanceNm)} nm`],
    [t("snapStart"), String(scenario.cargo.startYear)],
    [t("snapHorizon"), String(scenario.cargo.horizonYears)],
    [t("snapVessels"), String(scenario.cargo.vessels)],
    [t("snapRoundtrips"), String(scenario.cargo.roundtripsPerYear)],
    [t("snapGreenFuel"), `${idLabel(scenario.green.fuelId)} · ${idLabel(scenario.green.sourcing)}`],
    [t("snapFossilFuel"), `${idLabel(scenario.fossil.fuelId)} · ${idLabel(scenario.fossil.sourcing)}`],
    [
      t("snapGreenUse"),
      `${formatSig(result.intermediates.greenFuelTonnesPerVesselYear)} ${t("unitTPerVesselYr")}`,
    ],
    [
      t("snapFossilUse"),
      `${formatSig(result.intermediates.fossilFuelTonnesPerVesselYear)} ${t("unitTPerVesselYr")}`,
    ],
    [t("snapCargoLifetime"), formatSig(s.cargoUnitsLifetime)],
  ];

  return (
    // A vertical stack of full-width blocks, with explicit two-up ROWS where
    // two cards belong side by side. The previous 12-column grid tiled only
    // by accident: spans ran 12, 12, 7+5, 5+7, 5, and the middle rows closed
    // only because of a CONDITIONAL card (the per-tonne waterfall, hidden
    // when abatement is zero). Losing it reflowed every card below into a
    // different layout. Rows cannot do that to each other.
    <div className="space-y-4">
      {/* ===== KPI strip: one pixel-grid box ===== */}
      <div className="grid grid-cols-2 gap-px border border-neutral-300 bg-neutral-300 sm:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k, i) => (
          <div key={i} className="bg-white p-3">
            <Stat
              label={k.label}
              value={k.value}
              sub={k.sub}
              subTone={k.subTone === "warn" ? "warn" : "muted"}
              tone={k.strong ? "strong" : "default"}
            />
          </div>
        ))}
      </div>

      {/* ===== Scenario snapshot strip: what corridor these numbers describe.
          Directly under the KPIs so everything below reads in context. ===== */}
      {/* Standard card padding: this strip used px-3 py-2 for no stated
          reason, which is exactly the sort of near-miss that made the page
          read as unconsidered. */}
      <Card as="section">
        <SectionLabel className="mb-2">{t("snapshot")}</SectionLabel>
        {/* Dividers sit on the RIGHT of every item but the last, not on the
            left of every item but the first. The old index-keyed rule left a
            dangling separator at the start of every wrapped line — and with
            12-15 items this strip wraps at nearly every viewport.
            `min-w-0` + wrapping values: port names are free text, so a long
            one must break rather than push the whole flex line. */}
        <dl className="flex flex-wrap items-baseline gap-y-1 text-xs">
          {snapshot.map(([label, value], i) => (
            <div
              key={label}
              className={`flex min-w-0 items-baseline gap-1.5 pr-3 ${
                i < snapshot.length - 1 ? "mr-3 border-r border-neutral-200" : ""
              }`}
            >
              <dt className="whitespace-nowrap text-neutral-500">{label}</dt>
              <dd className="min-w-0 break-words font-medium tabular-nums text-neutral-900">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      {/* Two-up from xl: the waterfall and the table that itemises it read
          together. Below xl they stack, because a 4-column money table and a
          bar chart both need width more than they need adjacency. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* ===== Breakdown of total cost (the MMMCZCS waterfall) ===== */}
        <Card as="section">
        <SectionLabel className="mb-2">{t("waterfall")}</SectionLabel>
        <WaterfallChart data={waterfall.pv} />
        <p className="mt-1 text-xs text-neutral-500">{t("wfFootnote")}</p>
      </Card>

      {/* ===== Decomposition: green | fossil | Δ ===== */}
      <Card as="section">
        <SectionLabel className="mb-2">{t("decomposition")}</SectionLabel>
        {/* Four columns of $X,XXX.XXm cannot wrap - tabular-nums values have
            no break opportunity - so the table scrolls rather than forcing
            the card wider than its column. */}
        <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] text-xs tabular-nums">
          <thead>
            <tr className="border-b border-neutral-300 text-xs uppercase tracking-wide text-neutral-500">
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
                    <td className="py-1.5 text-right">{usdM(row.green)}</td>
                    <td className="py-1.5 text-right text-neutral-500">
                      {row.fossil === null ? "—" : usdM(row.fossil)}
                    </td>
                    <td className="py-1.5 text-right font-medium" style={deltaStyle(delta)}>
                      {usdMSigned(delta)}
                    </td>
                  </tr>
                  {row.subtotalAfter && (
                    <tr className="border-b border-neutral-300 bg-neutral-50 font-medium">
                      <td className="py-1.5">{t("subtotalPreReg")}</td>
                      <td className="py-1.5 text-right">
                        {usdM(rep.greenPreRegulationPvUsdM)}
                      </td>
                      <td className="py-1.5 text-right text-neutral-500">
                        {usdM(rep.fossilPreRegulationPvUsdM)}
                      </td>
                      <td className="py-1.5 text-right">
                        {usdMSigned(rep.gapPvPreRegulationUsdM)}
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
              <td className="pt-2 text-right">{usdM(s.greenTotalPvUsdM)}</td>
              <td className="pt-2 text-right">{usdM(s.fossilTotalPvUsdM)}</td>
              <td className="pt-2 text-right text-brand-deep">{usdMSigned(s.gapPvUsdM)}</td>
            </tr>
          </tfoot>
        </table>
        </div>
      </Card>

      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* ===== The same breakdown per tonne of CO2 abated ===== */}
        {waterfall.perTonne.length > 0 && (
          <Card as="section">
          <SectionLabel className="mb-2">
            {t("waterfallPerTonne")}{" "}
            <ValueChip>
              {t(`basisLabel.${basis}`)}
            </ValueChip>
          </SectionLabel>
          <WaterfallChart data={waterfall.perTonne} />
            <p className="mt-1 text-xs text-neutral-500">{t("wfFootnote")}</p>
          </Card>
        )}

        {/* ===== Annual cost — stacked by nature, green vs fossil ===== */}
        <Card as="section">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <SectionLabel>
            {t("perYear")}{" "}
            <span className="font-normal normal-case tracking-normal text-neutral-500">
              · {t("unitUsdM")}
            </span>
          </SectionLabel>
          {/* Legend — nature by shade, side by colour family; never colour alone */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600">
            <span className="text-neutral-500">{t("green")}:</span>
            <LegendSwatch color={NATURE_FILLS.gCapex} label={t("natureCapex")} />
            <LegendSwatch color={NATURE_FILLS.gOpex} label={t("natureOperating")} />
            <span className="text-neutral-500">{t("fossil")}:</span>
            <LegendSwatch color={NATURE_FILLS.fCapex} label={t("natureCapex")} />
            <LegendSwatch color={NATURE_FILLS.fOpex} label={t("natureOperating")} />
            <LegendSwatch color={NATURE_FILLS.reg} label={t("natureRegulation")} />
          </div>
        </div>
        {/* Text alternative: the endpoints and the peak, not 40 rows of data. */}
        <p className="sr-only">
          {perYear.length > 0
            ? `${perYear[0]!.year}: ${t("green")} ${usdM(perYear[0]!.green)}, ${t("fossil")} ${usdM(perYear[0]!.fossil)}. ` +
              `${perYear[perYear.length - 1]!.year}: ${t("green")} ${usdM(perYear[perYear.length - 1]!.green)}, ` +
              `${t("fossil")} ${usdM(perYear[perYear.length - 1]!.fossil)}.`
            : ""}
        </p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={perYear} margin={{ top: 4, right: 14, bottom: 0, left: 0 }} barCategoryGap="16%">
              <CartesianGrid {...GRID_PROPS} />
              {/* NOT interval={0}: the horizon is user input up to 40 years,
                  and forcing a tick per year overlapped the labels in a
                  half-width card. "preserveStartEnd" keeps the first and last
                  year legible and thins the middle to fit. */}
              <XAxis dataKey="year" {...X_AXIS_PROPS} interval="preserveStartEnd" />
              <YAxis {...Y_AXIS_PROPS} width={46} />
              <Tooltip
                formatter={(v, name) => [
                  typeof v === "number" ? usdM(v) : String(v),
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
          <p className="mt-1 text-xs leading-snug text-neutral-500">
            {/* "charged in full up front" is only true without a deployment
                schedule (sprint 4) — the phased variant drops the claim. */}
            {t(
              scenario.capitalPhasing?.enabled
                ? "annualPhasedCaption"
                : "annualYear1Caption",
              {
                capital: usdMShort(chartMeta.y1Capital),
                share: chartMeta.y1Share,
              },
            )}
          </p>
        )}
      </Card>

      </div>

      {/* ===== Emissions & abatement — the premium per tonne avoided =====
          Grouped bars per emissions basis, before and after the regulation
          modules, against the active scheme's carbon price as a reference
          line: how far above (or below) the market price of carbon this
          corridor's abatement sits.

          Full width, deliberately: it is the only card in its row, and a
          half-width orphan is what the old 12-column grid produced. */}
      <Card as="section">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <SectionLabel>
            {t("emissionsChart")}{" "}
            <span className="font-normal normal-case tracking-normal text-neutral-500">
              · {t("unitUsdPerTco2")}
            </span>
          </SectionLabel>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600">
            <LegendSwatch color="var(--viz-ink-muted)" label={t("abatePre")} />
            <LegendSwatch color="var(--color-brand)" label={t("abatePost")} />
          </div>
        </div>
        {/* Text alternative — derived from the same rows the bars use. */}
        <p className="sr-only">
          {abatementDiagram
            .map((d) => `${d.name}: ${t("abatePre")} ${usd(d.pre)}/t, ${t("abatePost")} ${usd(d.post)}/t`)
            .join(". ")}
          {refPrice ? ` ${refPrice.label}: ${usd(refPrice.usdPerTonne)}/t.` : ""}
        </p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={abatementDiagram} margin={{ top: 14, right: 14, bottom: 0, left: 0 }} barCategoryGap="28%">
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="name" {...X_AXIS_PROPS} interval={0} />
              <YAxis {...Y_AXIS_PROPS} width={44} allowDecimals={false} />
              {refPrice !== null && (
                <ReferenceLine
                  y={refPrice.usdPerTonne}
                  stroke="var(--viz-reference)"
                  strokeDasharray="4 3"
                  label={{
                    value: `${refPrice.label} $${Math.round(refPrice.usdPerTonne)}`,
                    position: "insideTopRight",
                    fontSize: 10,
                    fill: "var(--viz-reference)",
                  }}
                />
              )}
              <Tooltip
                formatter={(v, name) => [
                  // Was a bare toLocaleString, so this tooltip rendered
                  // $1,215.239/t against the card's $1,215/t for the same
                  // number. Whole dollars, like every other $/t in the app.
                  typeof v === "number" ? `${usd(v)}/t` : String(v),
                  name === "pre" ? t("abatePre") : t("abatePost"),
                ]}
                labelStyle={{ fontSize: 11 }}
                contentStyle={{ fontSize: 11 }}
              />
              {/* Before/after is a SEQUENCE, so it walks the logo ramp rather
                  than pairing a neutral grey with a brand blue: light blue to
                  deep blue reads as movement in one direction. */}
              <Bar dataKey="pre" fill="var(--viz-series-1)" isAnimationActive={false} maxBarSize={48} />
              <Bar dataKey="post" fill="var(--viz-anchor)" isAnimationActive={false} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-xs leading-snug text-neutral-500">
          {refPrice ? refPrice.note : t("abatementNoteNone")}
        </p>
        </Card>

      {/* ===== Results by tab: one section per input step, equal frames ===== */}
      {resolved && (
        <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {/* 02 Vessels */}
          <Card as="section">
            <SectionLabel className="mb-2">02 · {ts("vessels")}</SectionLabel>
            <TabTable
              green={t("sideGreen")}
              fossil={t("sideFossil")}
              rows={[
                [
                  t("tabFleetCapex"),
                  resolved.green.vesselCapexUsdM.value,
                  resolved.fossil.vesselCapexUsdM.value,
                ],
                [
                  t("tabFleetOpex"),
                  resolved.green.vesselOpexUsdMPerYear.value,
                  resolved.fossil.vesselOpexUsdMPerYear.value,
                ],
              ]}
            />
            {/* The INPUT is per-ship (v7) and this card reports the fleet
                total, so say which is which — the two differing by a factor
                of the vessel count is exactly the confusion that made the
                old benchmark mismatch invisible. */}
            <p className="mt-2 text-xs text-neutral-500">
              {t("tabPerShipNote", { vessels: resolved.vessels })}
            </p>
          </Card>

          {/* 03 Cargo */}
          <Card as="section">
            <SectionLabel className="mb-2">03 · {ts("cargo")}</SectionLabel>
            <dl className="text-xs">
              <TabRow label={t("tabCargoPerYear")} value={int(resolved.unitsPerYear)} />
              <TabRow label={t("snapCargoLifetime")} value={formatSig(s.cargoUnitsLifetime)} />
              <TabRow
                label={cargoUnit === "teu" ? t("perUnitTeu") : t("perUnitTonne")}
                value={usd(s.costPerUnitUsd)}
                sub={`${usd(rep.costPerUnitPreRegulationUsd)} ${t("preRegLabel")}`}
              />
              <TabRow label={t("co2")} value={`${formatSig(s.co2AbatedTonnes)} t`} />
            </dl>
          </Card>

          {/* 04 Energy */}
          <Card as="section">
            <SectionLabel className="mb-2">04 · {ts("energy")}</SectionLabel>
            <TabTable
              green={t("sideGreen")}
              fossil={t("sideFossil")}
              rows={[
                [
                  t("tabFuelUse"),
                  result.intermediates.greenFuelTonnesPerVesselYear,
                  result.intermediates.fossilFuelTonnesPerVesselYear,
                ],
                [
                  t("tabProdCapex"),
                  resolved.green.prodCapexUsdM.value,
                  resolved.fossil.prodCapexUsdM.value,
                ],
                [
                  t("tabProdOpex"),
                  resolved.green.prodOpexUsdMPerYear.value,
                  resolved.fossil.prodOpexUsdMPerYear.value,
                ],
                [
                  t("tabFuelPrice"),
                  resolved.green.priceUsdPerTonne.value,
                  resolved.fossil.priceUsdPerTonne.value,
                ],
                [t("tabWtw"), resolved.green.wtw.value, resolved.fossil.wtw.value],
              ]}
            />
            {/* Delivered-energy parity: abated tonnes are a MASS comparison,
                so they only describe the same transport work when the two
                burns carry equal energy. Derived = 1.000; a one-sided
                override breaks it. Disclosed, never corrected. */}
            {result.energyParity.diverged && (
              <Note className="mt-2">
                {t("energyParityNote", {
                  pct: Math.abs(result.energyParity.divergence! * 100).toFixed(0),
                  side:
                    result.energyParity.divergence! > 0
                      ? t("sideGreen")
                      : t("sideFossil"),
                })}
              </Note>
            )}
          </Card>

          {/* 05 Ports */}
          <Card as="section">
            <SectionLabel className="mb-2">05 · {ts("ports")}</SectionLabel>
            <TabTable
              green={t("sideGreen")}
              fossil={t("sideFossil")}
              rows={[
                [
                  t("tabStorageCapex"),
                  resolved.green.portStorageCapexUsdM.value,
                  resolved.fossil.portStorageCapexUsdM.value,
                ],
                [
                  t("tabStorageOpex"),
                  resolved.green.portStorageOpexUsdMPerYear.value,
                  resolved.fossil.portStorageOpexUsdMPerYear.value,
                ],
                [
                  t("tabBargeCapex"),
                  resolved.green.bargeCapexUsdM.value,
                  resolved.fossil.bargeCapexUsdM.value,
                ],
                [
                  t("tabBargeOpex"),
                  resolved.green.bargeOpexUsdMPerYear.value,
                  resolved.fossil.bargeOpexUsdMPerYear.value,
                ],
              ]}
            />
          </Card>

          {/* 06 Financing — its own tab since sprint 4's amendment */}
          <Card as="section">
            <SectionLabel className="mb-2">06 · {ts("financing")}</SectionLabel>
            <dl className="text-xs">
              <TabRow
                label={tc("wacc")}
                value={`${(resolved.wacc.value * 100).toFixed(1)}%`}
              />
              <TabRow
                label={tc("inflation")}
                value={`${(scenario.cargo.inflation * 100).toFixed(1)}%`}
              />
              {s.financingGreenPvUsdM !== undefined && (
                <TabRow
                  label={t("regFinancing")}
                  value={usdMSigned(s.financingGreenPvUsdM)}
                />
              )}
              {scenario.capitalPhasing?.enabled && (
                <TabRow
                  label={tReg("phasingToggle")}
                  value={scenario.capitalPhasing.green.weights
                    .map((w) => Math.round(w * 100))
                    .join("/")}
                  sub={
                    scenario.capitalPhasing.fossil.weights.join() !==
                    scenario.capitalPhasing.green.weights.join()
                      ? `${t("sideFossil")}: ${scenario.capitalPhasing.fossil.weights
                          .map((w) => Math.round(w * 100))
                          .join("/")}`
                      : undefined
                  }
                />
              )}
            </dl>
          </Card>

          {/* 07 Regulation */}
          <Card as="section">
            <SectionLabel className="mb-2">07 · {ts("regulation")}</SectionLabel>
            <TabTable
              green={t("sideGreen")}
              fossil={t("sideFossil")}
              money
              rows={[
                [t("regEts"), s.etsGreenPvUsdM, s.etsFossilPvUsdM],
                [t("regFuelEu"), s.fuelEuGreenPvUsdM, s.fuelEuFossilPvUsdM],
                [t("regIra"), s.ira45zGreenPvUsdM, null],
                [t("regSelf"), s.selfDesignedGreenPvUsdM, s.selfDesignedFossilPvUsdM],
                ...(imo
                  ? ([[t("regImo"), imo.green.pvUsdM, imo.fossil.pvUsdM]] as [
                      string,
                      number,
                      number | null,
                    ][])
                  : []),
              ]}
            />
            {/* Regulation-only net: the financing line reports on its own
                card, so it is excluded here (netReg carries both). */}
            <div className="mt-1.5 flex items-baseline justify-between border-t border-neutral-300 pt-1.5 text-xs font-semibold">
              <span>{t("netReg")}</span>
              <span
                className="tabular-nums"
                style={deltaStyle(netReg - (s.financingGreenPvUsdM ?? 0))}
              >
                {usdMSigned(netReg - (s.financingGreenPvUsdM ?? 0))}
              </span>
            </div>
            <dl className="mt-2 border-t border-neutral-100 pt-2 text-xs">
              {abatement.map((row) => (
                <TabRow
                  key={row.key}
                  label={
                    <>
                      {t("abatementCost")} · {t(`basisLabel.${row.key}`)}
                      {row.active && (
                        <ValueChip tone="brand">
                          {t("activeBasis")}
                        </ValueChip>
                      )}
                    </>
                  }
                  value={`${usd((s.gapPvUsdM * 1e6) / row.tonnes)}/t`}
                  sub={`${t("abated")}: ${formatSig(row.tonnes)} t`}
                />
              ))}
            </dl>
            {imo && imo.green.surplusTonnesCo2e > 0 && (
              <p className="mt-2 text-xs leading-snug text-neutral-500">
                {t("imoSurplus")}:{" "}
                <span className="tabular-nums font-medium text-neutral-700">
                  {formatSig(imo.green.surplusTonnesCo2e)} tCO2e
                </span>
              </p>
            )}
            {imoNotParam && (
              <Note className="mt-2">
                {t("imoNotParam")}
              </Note>
            )}
          </Card>
        </div>
      )}

      {/*
        Last, and deliberately so: the deterministic report above is what the
        rest of the tab means, and a distribution rendered alongside it invites
        reading one as a correction of the other.
      */}
      {/* What moves it most, per equal nudge — the live signed elasticity
          ranking, in the slot the removed tornado vacated. Above the
          probabilistic curve: it names WHICH inputs matter, which is the
          question a reader has before "how wide is the answer". */}
      <ElasticitySection scenario={result ? scenario : null} />
      <ProbabilisticSection summary={result?.summary ?? null} />
    </div>
  );
}
