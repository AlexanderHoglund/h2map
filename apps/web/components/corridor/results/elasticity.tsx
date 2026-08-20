"use client";

/**
 * "What moves this corridor" — the signed elasticity ranking, live.
 *
 * The only view computed on the scenario in front of the user: the offline
 * range sweep behind §29 and §38 answers "how far does an assumed range push
 * the number", the tornado answers "what is the
 * researched uncertainty worth here", and THIS answers "which input moves the
 * output most per equal-sized change" — a property of the model at the
 * user's own point, inheriting no range from anybody.
 *
 * The arithmetic lives in `lib/corridor/elasticityLive.ts` (pure, tested,
 * drift-pinned against the offline harness). This component only lays it
 * out, under three hard display rules the module's docblock motivates:
 *
 *   - SIGNED, always: −0.34 means the output falls as the input rises, and
 *     the sign flips between output tabs (distance is −0.37 on the abatement
 *     cost and +0.63 on the gap of the same corridor — both are true).
 *   - TWO FAMILIES, never one ordering: ±10% quantities and ±1pp rates are
 *     ranked among themselves only.
 *   - Coupled inputs rank as ONE row; their members render as indented
 *     detail, because a solo member move is a state the model rejects.
 */

import React, { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { ScenarioInput } from "@h2map/corridor-schema";
import { Card } from "@/components/ui/Card";
import { Note, SectionLabel } from "@/components/ui/Stat";
import {
  computeLiveElasticity,
  rankedEntries,
  ELASTICITY_KPIS,
  type ElasticityKpi,
  type LiveElasticityEntry,
  type LiveElasticityResult,
} from "@/lib/corridor/elasticityLive";
import { DEFAULT_BUNDLE } from "../state";

/**
 * Dataset ids as i18n keys: next-intl reserves "." for nesting, so ids are
 * slugified at the lookup boundary (the tornado's convention, kept).
 */
const messageKey = (id: string): string => id.replace(/\./g, "-");

/** Signed, two decimals, true minus sign — "+0.63" / "−0.34" / "0.00". */
const fmt = (v: number): string => {
  const s = v.toFixed(2);
  if (s === "0.00" || s === "-0.00") return "0.00";
  return v > 0 ? `+${s}` : s.replace("-", "−");
};

function Row({
  entry,
  kpi,
  max,
  t,
  children,
}: {
  entry: LiveElasticityEntry;
  kpi: ElasticityKpi;
  /** The family's largest |value| — one shared axis per family. */
  max: number;
  t: ReturnType<typeof useTranslations>;
  children?: React.ReactNode;
}) {
  const v = entry.perKpi[kpi];
  // Diverging bar around a centre axis: position carries the sign, length
  // the magnitude, so the ranking is readable without reading numbers.
  const half = max > 0 ? (Math.abs(v.value) / max) * 50 : 0;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <span className="min-w-0 font-medium text-neutral-800">
          {t(`elasticityRow.${messageKey(entry.id)}`)}
          {entry.group && (
            <span className="ml-1.5 font-normal text-neutral-500">
              {t("elasticityCoupled")}
            </span>
          )}
          {v.nonlinear && (
            <span
              className="ml-1.5 font-normal text-amber-700"
              title={t("elasticityNonlinearTitle", { up: fmt(v.up), down: fmt(v.down) })}
            >
              {t("elasticityNonlinear")}
            </span>
          )}
        </span>
        <span className="tabular-nums font-medium text-neutral-900">{fmt(v.value)}</span>
      </div>
      <div className="relative mt-1 h-3.5 w-full bg-neutral-100">
        <div className="absolute inset-y-0 left-1/2 w-px bg-neutral-400" />
        <div
          className="absolute inset-y-1"
          style={{
            left: v.value < 0 ? `${50 - half}%` : "50%",
            width: `${Math.max(half, v.value === 0 ? 0 : 0.4)}%`,
            background: "var(--viz-anchor)",
          }}
        />
      </div>
      {children}
    </div>
  );
}

export function ElasticitySection({ scenario }: { scenario: ScenarioInput | null }) {
  const t = useTranslations("corridor.results");
  const [kpi, setKpi] = useState<ElasticityKpi>("gapPvUsdM");

  // ~90 engine evaluations, microseconds each — measured at ~25 ms for a
  // whole recompute, cheap enough to memoize on scenario change (the same
  // budget the per-keystroke evaluation already spends many times over).
  const result: LiveElasticityResult | null = useMemo(
    () => (scenario ? computeLiveElasticity(scenario, DEFAULT_BUNDLE) : null),
    [scenario],
  );

  if (!result || result.entries.length === 0) return null;

  const relative = rankedEntries(result, kpi, "relative");
  const rates = rankedEntries(result, kpi, "absolutePp");
  const relMoving = relative.filter((e) => e.perKpi[kpi].value !== 0);
  const relZero = relative.filter((e) => e.perKpi[kpi].value === 0);
  const rateMoving = rates.filter((e) => e.perKpi[kpi].value !== 0);
  const rateZero = rates.filter((e) => e.perKpi[kpi].value === 0);
  const maxRel = Math.max(...relative.map((e) => Math.abs(e.perKpi[kpi].value)), 0);
  const maxRate = Math.max(...rates.map((e) => Math.abs(e.perKpi[kpi].value)), 0);
  const detail = (id: string) => result.entries.find((e) => e.id === id && !e.group);

  const zeroLine = (zeros: LiveElasticityEntry[]) =>
    zeros.length > 0 && (
      <p className="mt-2 text-[11px] leading-snug text-neutral-500">
        {t("elasticityZeros")}{" "}
        {zeros.map((e) => t(`elasticityRow.${messageKey(e.id)}`)).join(" · ")}
      </p>
    );

  const unmeasured = [
    ...result.skipped,
    ...result.excluded.map((e) => ({ id: e.id, reason: "excluded" as const })),
  ];

  return (
    <Card as="section" className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionLabel>{t("elasticity")}</SectionLabel>
        <label className="flex items-center gap-2 text-xs text-neutral-600">
          {t("elasticityKpiLabel")}
          <select
            value={kpi}
            onChange={(e) => setKpi(e.target.value as ElasticityKpi)}
            className="border border-neutral-300 bg-white px-2 py-1 text-xs"
          >
            {ELASTICITY_KPIS.map((k) => (
              <option key={k} value={k}>
                {t(`kpi.${k}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-1 text-xs leading-snug text-neutral-500">{t("elasticityIntro")}</p>

      {/* ---- family 1: ordinary quantities, ±10% ---- */}
      <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
        {t("elasticityFamilyRelative")}
      </p>
      <div className="mt-2 space-y-2.5">
        {relMoving.map((e) => (
          <Row key={e.id} entry={e} kpi={kpi} max={maxRel} t={t}>
            {e.group && e.members && (
              <details className="mt-0.5">
                <summary className="cursor-pointer text-[11px] text-neutral-500">
                  {t("elasticityMembers")}
                </summary>
                <dl className="mt-1 space-y-0.5 border-l border-neutral-200 pl-3">
                  {e.members.map((m) => {
                    const me = detail(m);
                    return me ? (
                      <div key={m} className="flex items-baseline justify-between text-[11px]">
                        <dt className="text-neutral-500">
                          {t(`elasticityRow.${messageKey(m)}`)}{" "}
                          <span className="text-neutral-400">
                            — {t("elasticityMemberSolo")}
                          </span>
                        </dt>
                        <dd className="tabular-nums text-neutral-600">
                          {fmt(me.perKpi[kpi].value)}
                        </dd>
                      </div>
                    ) : null;
                  })}
                </dl>
              </details>
            )}
          </Row>
        ))}
      </div>
      {zeroLine(relZero)}

      {/* ---- family 2: rates, ±1 percentage point ---- */}
      {rates.length > 0 && (
        <>
          <p className="mt-5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            {t("elasticityFamilyRates")}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">
            {t("elasticityRatesNote")}
          </p>
          <div className="mt-2 space-y-2.5">
            {rateMoving.map((e) => (
              <Row key={e.id} entry={e} kpi={kpi} max={maxRate} t={t} />
            ))}
          </div>
          {zeroLine(rateZero)}
        </>
      )}

      <p className="mt-3 text-[11px] leading-snug text-neutral-500">
        {t("elasticityNonlinearNote")}
      </p>

      {/* Not measurable here ≠ does not matter — say which and why. The
          disclosure IS the note (a <details> cannot nest in Note's <p>). */}
      {unmeasured.length > 0 && (
        <details className="mt-3 bg-warning/10 px-2 py-1.5 text-xs leading-snug text-warning">
          <summary className="cursor-pointer">
            {t("elasticityUnmeasured")} ({unmeasured.length})
          </summary>
          <div className="mt-1 leading-snug">
            {unmeasured
              .map(
                (s) =>
                  `${t(`elasticityRow.${messageKey(s.id)}`)} (${t(
                    `elasticityReason.${s.reason}`,
                  )})`,
              )
              .join("; ")}
          </div>
        </details>
      )}
    </Card>
  );
}
