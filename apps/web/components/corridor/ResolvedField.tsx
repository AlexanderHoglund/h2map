"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import type { Source } from "@h2map/corridor-schema";
import { formatSig } from "@h2map/units";
import { Help } from "@/components/ui/Help";
import { plausibility } from "@/lib/corridor/plausibility";
import { ProvenanceBadge } from "./ProvenanceBadge";

/**
 * THE input component (build-plan 3.2): one component for every corridor
 * input, the direct implementation of `Resolved<T>` and of the reference
 * blue-input/black-formula convention:
 *
 * - value + unit label (from the branded type's unit, passed as a string)
 * - source badge: override / derived / benchmark
 * - the benchmark stays visible while overridden ("benchmark: 900 — restore")
 * - an unverified reference row carries an explicit badge, derived from
 *   `provenance.verified` (since bundle 2026-08-21-verified-v5 every active
 *   row is verified, pooled with a stated basis, or designated — the badge
 *   machinery stays for older pinned bundles and future data)
 * - overridden values render blue ("blue = your input")
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
  expectZero,
  baseline,
  disabled,
  disabledNote,
  provenance,
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
  /** REQUIRED pedagogic explanation — see NumberInput. */
  help: string;
  /** Accepted for call-site compatibility; the text input has no stepper. */
  step?: number | "any";
  /**
   * Zero is CANONICAL for this field — never note it as implausible. Exists
   * for the double-count remedy: under a legacy plant-mode scenario, zeroing
   * the price (or a production line) is the documented fix, not a mistake.
   */
  expectZero?: boolean;
  /**
   * The override this SESSION started with (model.loaded). A value equal to
   * it never earns the plausibility note: loaded data — curated study
   * overrides included — is the scenario's own, not a user slip. Only what
   * the user changed since load can warn, so reopening a project clears
   * every note.
   */
  baseline?: number | null;
  disabled?: boolean;
  /** Shown instead of the benchmark line when the field is force-disabled. */
  disabledNote?: string;
  /**
   * Provenance for the source badge's tooltip (sprint 3, task 2):
   * `citation` names the reference row (bundle id + sourceNote cell);
   * `derivation` is the short formula behind a derived value. The badge
   * assembles the right sentence for its source.
   */
  provenance?: {
    citation?: string;
    verified?: boolean;
    derivation?: string;
    /** Docs section id — the badge popover links to /docs#<id>. */
    docsId?: string;
  };
}) {
  const t = useTranslations("corridor.field");
  const id = useId();
  // Free-typing buffer so "1." or "-" doesn't snap back mid-edit.
  const [draft, setDraft] = useState<string | null>(null);

  // Display precedence: mid-edit draft raw → override exactly as typed →
  // derived/benchmark value at four significant figures, grouped. The full
  // value stays in the scenario — rounding here is display-only, which is
  // why the input is type="text": "9,806" is not a valid number-input value.
  const shown = draft ?? (override !== null ? String(override) : formatSig(effective));
  const overridden = override !== null;

  // Plausibility note (advisory, never blocking): the user's committed number
  // against the benchmark — but only where it DEPARTS from what this session
  // loaded (`baseline`): stored values are the scenario's own data. Suppressed
  // mid-edit (`draft !== null`) so it appears once the field is left —
  // validate after entry, never mid-keystroke.
  const warn =
    disabled || expectZero || draft !== null || override === (baseline ?? null)
      ? null
      : plausibility(override, benchmark);

  const badgeStyles: Record<Source, string> = {
    override: "bg-brand-tint text-brand-deep",
    derived: "bg-purple-500/15 text-purple-700",
    benchmark: "bg-neutral-500/15 text-neutral-600",
  };

  // "Where does this number come from?" — the badge's hover/focus answer.
  const provenanceText = (() => {
    if (!provenance) return undefined;
    const cite = provenance.citation;
    const unv = provenance.verified === false ? ` \u00b7 ${t("provUnverified")}` : "";
    if (source === "derived") {
      // The unverified suffix belongs on BOTH derived branches. It used to
      // be dropped whenever a `derivation` was supplied \u2014 and vessel CAPEX
      // always supplies one and always resolves derived, so an unverified
      // vessel row's status never reached the user. That is not a corner
      // case: the default scenario's vessel is `verified: false`.
      return provenance.derivation
        ? `${t("provDerived")} ${provenance.derivation}${cite ? ` (${cite})` : ""}${unv}`
        : cite
          ? `${t("provDerived")} ${cite}${unv}`
          : undefined;
    }
    if (source === "benchmark") {
      return cite ? `${t("provBenchmark")} ${cite}${unv}` : undefined;
    }
    // An override is the USER's number, so the row's verification status
    // says nothing about it \u2014 the citation is shown only to name what was
    // overridden.
    return `${t("provOverride", { benchmark: formatSig(benchmark) })}${
      cite ? ` (${cite})` : ""
    }`;
  })();

  // Disabled state: grey the input SURFACE, never opacity-dim the whole block
  // — dimmed labels/notes fail WCAG contrast (axe), and the note must stay
  // readable ("forced to 0 under this sourcing" is information, not chrome).
  return (
    <div className="group/field">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={id}
          className="flex items-center gap-1.5 text-xs font-medium text-neutral-600"
        >
          {label}
          <Help text={help} />
        </label>
        <ProvenanceBadge
          label={t(source)}
          className={badgeStyles[source]}
          provenance={provenanceText}
          docsId={provenanceText ? provenance?.docsId : undefined}
          docsLabel={t("provDocs")}
        />
      </div>
      <div
        className={`mt-1 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 transition-colors focus-within:ring-2 ${
          disabled
            ? "bg-neutral-100"
            : "bg-white"
        } ${
          overridden
            ? "border-brand/60 focus-within:ring-brand/40"
            : "border-neutral-300 focus-within:border-brand focus-within:ring-brand/40"
        }`}
      >
        <input
          id={id}
          type="text"
          inputMode="decimal"
          disabled={disabled}
          value={shown}
          onChange={(e) => {
            const text = e.target.value;
            setDraft(text);
            if (text.trim() === "") {
              onChange(null); // cleared = back to the benchmark
              return;
            }
            // Tolerate the grouped display being edited in place.
            const n = Number(text.replace(/,/g, ""));
            if (Number.isFinite(n)) onChange(n);
          }}
          onBlur={() => setDraft(null)}
          className={`min-w-0 flex-1 bg-transparent text-sm tabular-nums outline-none ${
            overridden ? "font-medium text-brand-strong" : ""
          }`}
        />
        {unit ? (
          <span className="shrink-0 text-xs text-neutral-600">{unit}</span>
        ) : null}
      </div>
      <div className="mt-0.5 flex min-h-4 items-center gap-2 text-[11px] text-neutral-500">
        {disabled && disabledNote ? (
          <span>{disabledNote}</span>
        ) : overridden ? (
          <>
            <span>
              {t("benchmarkPrefix")} {formatSig(benchmark)}
              {unit ? ` ${unit}` : ""}
            </span>
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                onChange(null);
              }}
              className="font-medium text-brand hover:underline"
            >
              {t("restore")}
            </button>
          </>
        ) : null}
        {/* An unverified REFERENCE row is a fact about the number the model
            is using, so it earns the badge automatically — a tooltip alone
            is too quiet for it. An override is the user's own number, so
            the row's status no longer applies. */}
        {provenance?.verified === false && !overridden ? (
          <span className="bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
            {t("unverified")}
          </span>
        ) : null}
      </div>
      {/* The amber tier, applied to the input's own magnitude: legal, computes,
          but far off the cited benchmark — worth a look, never a block. The
          "restore" affordance above is the one-click fix; a deliberate value
          is simply left standing. */}
      {warn ? (
        <p className="mt-1 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-800">
          {t(`plaus_${warn}`, {
            benchmark: formatSig(benchmark),
            unit: unit ?? "",
          })}
        </p>
      ) : null}
    </div>
  );
}
