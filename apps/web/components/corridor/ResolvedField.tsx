"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import type { Source } from "@h2map/corridor-schema";

/**
 * THE input component (build-plan 3.2): one component for every corridor
 * input, the direct implementation of `Resolved<T>` and of the workbook's
 * blue-input/black-formula convention:
 *
 * - value + unit label (from the branded type's unit, passed as a string)
 * - source badge: override / derived / benchmark
 * - the benchmark stays visible while overridden ("benchmark: 900 — restore")
 * - unverified benchmarks carry an explicit badge (the workbook's country-
 *   WACC footnote becomes UI, not a footnote)
 * - overridden values render blue (the workbook's "blue = your input")
 */
export default function ResolvedField({
  label,
  unit,
  override,
  effective,
  source,
  benchmark,
  onChange,
  help,
  unverified,
  step = "any",
  disabled,
  disabledNote,
}: {
  label: string;
  unit?: string;
  /** The user's override (null = using the benchmark). */
  override: number | null;
  /** The value the model actually uses (override ?? resolved benchmark). */
  effective: number;
  source: Source;
  /** The benchmark that an override replaces (always shown when overridden). */
  benchmark: number;
  onChange: (next: number | null) => void;
  help?: string;
  unverified?: boolean;
  step?: number | "any";
  disabled?: boolean;
  /** Shown instead of the benchmark line when the field is force-disabled. */
  disabledNote?: string;
}) {
  const t = useTranslations("corridor.field");
  const id = useId();
  // Free-typing buffer so "1." or "-" doesn't snap back mid-edit.
  const [draft, setDraft] = useState<string | null>(null);

  const shown = draft ?? (override !== null ? String(override) : String(round(effective)));
  const overridden = override !== null;

  const badgeStyles: Record<Source, string> = {
    override: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    derived: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
    benchmark: "bg-neutral-500/15 text-neutral-600 dark:text-neutral-300",
  };

  // Disabled state: grey the input SURFACE, never opacity-dim the whole block
  // — dimmed labels/notes fail WCAG contrast (axe), and the note must stay
  // readable ("forced to 0 under this sourcing" is information, not chrome).
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={id}
          className="flex items-center gap-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400"
        >
          {label}
          {help ? <Help text={help} /> : null}
        </label>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${badgeStyles[source]}`}
        >
          {t(source)}
        </span>
      </div>
      <div
        className={`mt-1 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 transition-colors focus-within:ring-2 ${
          disabled
            ? "bg-neutral-100 dark:bg-neutral-800"
            : "bg-white dark:bg-neutral-900"
        } ${
          overridden
            ? "border-blue-400 focus-within:ring-blue-500/40 dark:border-blue-600"
            : "border-neutral-300 focus-within:border-blue-600 focus-within:ring-blue-500/40 dark:border-neutral-700"
        }`}
      >
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          disabled={disabled}
          value={shown}
          onChange={(e) => {
            const text = e.target.value;
            setDraft(text);
            if (text.trim() === "") {
              onChange(null); // cleared = back to the benchmark
              return;
            }
            const n = Number(text);
            if (Number.isFinite(n)) onChange(n);
          }}
          onBlur={() => setDraft(null)}
          className={`min-w-0 flex-1 bg-transparent text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
            overridden ? "font-medium text-blue-700 dark:text-blue-400" : ""
          }`}
        />
        {unit ? (
          <span className="shrink-0 text-xs text-neutral-600 dark:text-neutral-400">{unit}</span>
        ) : null}
      </div>
      <div className="mt-0.5 flex min-h-4 items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-500">
        {disabled && disabledNote ? (
          <span>{disabledNote}</span>
        ) : overridden ? (
          <>
            <span>
              {t("benchmarkPrefix")} {formatNumber(benchmark)}
              {unit ? ` ${unit}` : ""}
            </span>
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                onChange(null);
              }}
              className="font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              {t("restore")}
            </button>
          </>
        ) : null}
        {unverified ? (
          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-400/20 dark:text-amber-300">
            {t("unverified")}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Help({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <span
        aria-label={text}
        className="flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-neutral-200 text-[9px] font-semibold text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
      >
        ?
      </span>
      <span className="pointer-events-none absolute left-0 top-5 z-20 hidden w-64 rounded-md border border-neutral-200 bg-white p-2 text-[11px] font-normal leading-snug text-neutral-700 shadow-lg group-hover:block dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
        {text}
      </span>
    </span>
  );
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString("en-US");
  return String(Math.round(n * 1e4) / 1e4);
}
