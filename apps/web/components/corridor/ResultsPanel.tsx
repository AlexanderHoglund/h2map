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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ScenarioInput, ScenarioResult } from "@h2map/corridor-schema";

/**
 * The docked results panel (build-plan 3.4) — the Output tab reborn:
 * headline (gap PV, $/unit, $/tCO2 with the D1 basis label), the cost-bridge
 * waterfall (Output rows 33–42: fossil → ΔCAPEX → ΔOPEX → ±regulation →
 * green, hidden float base), the six-line regulatory PV table, and the
 * year-by-year green-vs-fossil chart. Updates on every keystroke — the
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

  const perYear = useMemo(() => {
    if (!result) return [];
    const start = scenario.cargo.startYear;
    return result.perYear.green.totalUsdM.map((g, i) => ({
      year: start + i,
      green: round2(g),
      fossil: round2(result.perYear.fossil.totalUsdM[i] ?? 0),
    }));
  }, [result, scenario.cargo.startYear]);

  if (error || !result) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-500/10 p-3 text-xs leading-snug text-amber-700 dark:border-amber-700 dark:text-amber-500">
        {t("invalid", { message: error ?? "…" })}
      </div>
    );
  }

  const s = result.summary;
  const basis = scenario.flags?.emissionsBasis ?? "combustion";
  const netReg =
    s.etsGreenPvUsdM +
    s.fuelEuGreenPvUsdM +
    s.ira45zGreenPvUsdM +
    s.selfDesignedGreenPvUsdM -
    (s.etsFossilPvUsdM + s.fuelEuFossilPvUsdM + s.selfDesignedFossilPvUsdM);

  const COLORS = { total: "#525252", up: "#dc2626", down: "#16a34a" };

  return (
    <div className="space-y-4">
      {/* Headline */}
      <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
        <p className="text-xs text-neutral-500" title={t("gapHelp")}>
          {t("gap")}
        </p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums">
          {fmtUsdM(s.gapPvUsdM)}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="tabular-nums font-medium">{fmtUsd(s.costPerUnitUsd)}</p>
            <p className="text-neutral-500">{t("perUnit")}</p>
          </div>
          <div>
            <p className="tabular-nums font-medium">{fmtUsd(s.costPerTonneCo2Usd)}</p>
            <p className="text-neutral-500">
              {t("perTonne")}
              <span className="ml-1 rounded bg-neutral-500/10 px-1 py-px text-[10px]">
                {t(`basisLabel.${basis}`)}
              </span>
            </p>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 border-t border-neutral-200 pt-2 text-xs dark:border-neutral-800">
          <div>
            <p className="tabular-nums">{fmtUsdM(s.greenTotalPvUsdM)}</p>
            <p className="text-neutral-500">{t("green")}</p>
          </div>
          <div>
            <p className="tabular-nums">{fmtUsdM(s.fossilTotalPvUsdM)}</p>
            <p className="text-neutral-500">{t("fossil")}</p>
          </div>
        </div>
        {result.divergences?.emissionsBasis && (
          <p className="mt-2 text-[11px] text-neutral-500">
            {t("bothBases", {
              ttw: fmtInt(result.divergences.emissionsBasis.co2AbatedTonnesCombustion),
              wtw: fmtInt(result.divergences.emissionsBasis.co2AbatedTonnesWellToWake),
            })}
          </p>
        )}
      </div>

      {/* Waterfall */}
      <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
        <p className="mb-2 text-xs font-medium text-neutral-600 dark:text-neutral-400">
          {t("waterfall")}
        </p>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={waterfall} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} />
              <YAxis tick={{ fontSize: 10 }} width={44} unit="" />
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
      </div>

      {/* Regulatory table */}
      <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
        <p className="mb-2 text-xs font-medium text-neutral-600 dark:text-neutral-400">
          {t("regTable")}
        </p>
        <table className="w-full text-xs tabular-nums">
          <tbody>
            {(
              [
                [t("regEts"), s.etsGreenPvUsdM, s.etsFossilPvUsdM],
                [t("regFuelEu"), s.fuelEuGreenPvUsdM, s.fuelEuFossilPvUsdM],
                [t("regIra"), s.ira45zGreenPvUsdM, null],
                [t("regSelf"), s.selfDesignedGreenPvUsdM, s.selfDesignedFossilPvUsdM],
              ] as const
            ).map(([label, g, f]) => (
              <tr key={label} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60">
                <td className="py-1 text-neutral-600 dark:text-neutral-400">{label}</td>
                <td className="py-1 text-right">{fmtUsdM(g)}</td>
                <td className="py-1 text-right text-neutral-500">
                  {f === null ? "—" : fmtUsdM(f)}
                </td>
              </tr>
            ))}
            <tr>
              <td className="pt-1.5 font-medium">{t("netReg")}</td>
              <td
                colSpan={2}
                className={`pt-1.5 text-right font-medium ${netReg < 0 ? "text-emerald-600 dark:text-emerald-500" : ""}`}
              >
                {fmtUsdM(netReg)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Year-by-year */}
      <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
        <p className="mb-2 text-xs font-medium text-neutral-600 dark:text-neutral-400">
          {t("perYear")}
        </p>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={perYear} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={44} />
              <Tooltip
                formatter={(v) => (typeof v === "number" ? fmtUsdM(v) : String(v))}
                labelStyle={{ fontSize: 11 }}
                contentStyle={{ fontSize: 11 }}
              />
              <Line type="monotone" dataKey="green" stroke="#16a34a" dot={false} strokeWidth={2} isAnimationActive={false} />
              <Line type="monotone" dataKey="fossil" stroke="#737373" dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Footers */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-neutral-200 p-2.5 dark:border-neutral-800">
          <p className="tabular-nums font-medium">{fmtInt(s.co2AbatedTonnes)} t</p>
          <p className="text-neutral-500">{t("co2")}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 p-2.5 dark:border-neutral-800">
          <p className="tabular-nums font-medium">{fmtInt(s.cargoUnitsLifetime)}</p>
          <p className="text-neutral-500">{t("cargo")}</p>
        </div>
      </div>
    </div>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function fmtUsdM(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}m`;
}
function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
