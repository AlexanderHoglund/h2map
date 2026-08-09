"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";

/**
 * A bounded numeric selector with ResolvedField's provenance chrome: source
 * badge (override when the choice differs from the benchmark default,
 * benchmark otherwise), and the benchmark line with a restore link while
 * overridden. For fields whose sensible values are an enumerable range —
 * model years, horizons — where free numeric entry invites out-of-schema
 * input the form would only reject later.
 *
 * If the current value sits outside `options` (an imported scenario using
 * the schema's wider bounds), it is prepended as an extra option — the
 * selector never silently changes a stored value.
 */
export default function SelectField({
  label,
  value,
  options,
  benchmark,
  onChange,
  help,
}: {
  label: string;
  value: number;
  /** The offered range, ascending. */
  options: readonly number[];
  /** The reference default the badge and restore line compare against. */
  benchmark: number;
  onChange: (next: number) => void;
  help?: string;
}) {
  const t = useTranslations("corridor.field");
  const id = useId();
  const overridden = value !== benchmark;
  const listed = options.includes(value) ? options : [value, ...options];

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-neutral-600">
          {label}
        </label>
        <span
          className={`px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
            overridden
              ? "bg-brand-tint text-brand-deep"
              : "bg-neutral-500/15 text-neutral-600"
          }`}
        >
          {t(overridden ? "override" : "benchmark")}
        </span>
      </div>
      <select
        id={id}
        value={value}
        title={help}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`mt-1 w-full rounded-md border bg-white px-2.5 py-1.5 text-sm tabular-nums outline-none transition-colors focus:ring-2 ${
          overridden
            ? "border-brand/60 font-medium text-brand-strong focus:ring-brand/40"
            : "border-neutral-300 focus:border-brand focus:ring-brand/40"
        }`}
      >
        {listed.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <div className="mt-0.5 flex min-h-4 items-center gap-2 text-[11px] text-neutral-500">
        {overridden ? (
          <>
            <span>
              {t("benchmarkPrefix")} {benchmark}
            </span>
            <button
              type="button"
              onClick={() => onChange(benchmark)}
              className="font-medium text-brand hover:underline"
            >
              {t("restore")}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
