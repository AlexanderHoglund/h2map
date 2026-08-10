"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { formatSig } from "@h2map/units";
import { Help } from "@/components/ui/Help";
import type { CanalTransit } from "@/lib/seaRoute";
import type { SeaRouteState } from "./useSeaRoute";

/**
 * The distance field with the routed benchmark (sprint 3.3c). Distance is
 * the model's most sensitive input (74% headline movement across its
 * range), so the routed figure enters through the resolution pattern, not
 * around it: override > derived(routed). ADOPTION-ONLY — the spec's "new
 * scenarios populate automatically" conflicts with its own acceptance test
 * ("adopting the routed figure is the only path by which a result
 * changes, and it is user-initiated"); the test wins. The field shows
 * DERIVED exactly when the stored value equals the current routed figure —
 * so it reverts to override if coordinates later move the route, and no
 * stored scenario is ever rewritten.
 */
export default function RoutedDistanceField({
  label,
  value,
  route,
  onChange,
  onAdopt,
}: {
  label: string;
  value: number;
  route: SeaRouteState;
  onChange: (next: number) => void;
  onAdopt: (nm: number, graphVersion: string, via: CanalTransit | null) => void;
}) {
  const t = useTranslations("corridor.cargo");
  const tf = useTranslations("corridor.field");
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);

  const routed = route.status === "ok" && route.data ? route.data : null;
  const routedNm = routed ? Math.round(routed.nm) : null;
  const isDerived = routedNm !== null && value === routedNm;
  const divergencePct =
    routed && !isDerived ? Math.abs(value - routed.nm) / routed.nm : 0;

  const viaLabel = routed
    ? routed.via === "panama"
      ? t("viaPanama")
      : routed.via === "suez"
        ? t("viaSuez")
        : t("viaNone")
    : "";

  const shown = draft ?? (isDerived ? formatSig(value) : String(value));

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={id}
          className="flex items-center gap-1.5 text-xs font-medium text-neutral-600"
        >
          {label}
          {routed ? (
            <Help
              text={t("routedHelp", { graph: routed.graphVersion, via: viaLabel })}
            />
          ) : null}
        </label>
        <span
          className={`px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
            isDerived
              ? "bg-purple-500/15 text-purple-700"
              : "bg-brand-tint text-brand-deep"
          }`}
        >
          {tf(isDerived ? "derived" : "override")}
        </span>
      </div>
      <div
        className={`mt-1 flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1.5 transition-colors focus-within:ring-2 ${
          isDerived
            ? "border-neutral-300 focus-within:border-brand focus-within:ring-brand/40"
            : "border-brand/60 focus-within:ring-brand/40"
        }`}
      >
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={shown}
          onChange={(e) => {
            const text = e.target.value;
            setDraft(text);
            const n = Number(text.replace(/,/g, ""));
            if (Number.isFinite(n) && n > 0) onChange(n);
          }}
          onBlur={() => setDraft(null)}
          className={`min-w-0 flex-1 bg-transparent text-sm tabular-nums outline-none ${
            isDerived ? "" : "font-medium text-brand-strong"
          }`}
        />
        <span className="shrink-0 text-xs text-neutral-600">nm</span>
      </div>
      <div className="mt-0.5 flex min-h-4 flex-wrap items-center gap-2 text-[11px] text-neutral-500">
        {routed && !isDerived ? (
          <>
            <span>
              {t("routedPrefix")} {formatSig(routed.nm)} nm
            </span>
            <button
              type="button"
              onClick={() =>
                onAdopt(Math.round(routed.nm), routed.graphVersion, routed.via)
              }
              className="font-medium text-brand hover:underline"
            >
              {t("routedAdopt")}
            </button>
          </>
        ) : null}
      </div>
      {/* Routed-vs-typed divergence: somebody typing a great-circle figure
          for a Panama trade is missing the transit by thousands of miles —
          this is the moment to say so, without blocking anything. */}
      {routed && !isDerived && divergencePct > 0.15 ? (
        <p className="mt-1 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-800">
          {t("routedDivergence", {
            pct: Math.round(divergencePct * 100),
            nm: formatSig(routed.nm),
            via: viaLabel,
          })}
        </p>
      ) : null}
    </div>
  );
}
