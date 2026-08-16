"use client";

/**
 * Label-over-value readouts and the micro-label above them.
 *
 * These two shapes were re-typed across the corridor results panel with
 * three weights, three tracking values, two sizes and two colours for one
 * visual idea. The calculator's results section had already settled on a
 * single form; this is that form, extracted so both can share it.
 *
 * Deliberately NOT `ui/Badge`: a Badge is a filled status CHIP ("unverified"),
 * and putting a background wash behind every section heading would add noise
 * to a page whose problem is already density. An eyebrow is bare text.
 */

/**
 * The uppercase micro-label above a section, a chart, or a number.
 *
 * `text-xs` rather than the corridor's old `text-[11px]`: it matches the
 * calculator and keeps the panel on Tailwind's scale instead of an
 * arbitrary pixel value.
 */
export function SectionLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`text-xs font-medium uppercase tracking-wide text-neutral-500 ${className}`}
    >
      {children}
    </p>
  );
}

/**
 * An inline chip carrying a VALUE beside a label — an emissions basis, a
 * framework name.
 *
 * Not `ui/Badge`, and the difference is not cosmetic: Badge forces
 * `uppercase tracking-wide` because it labels a STATUS ("unverified"). These
 * carry data like "well-to-wake", and the corridor's hand-rolled copies all
 * had to spend `normal-case tracking-normal` undoing the eyebrow's casing.
 * Uppercasing a value would misrepresent it.
 */
export function ValueChip({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "brand";
  children: React.ReactNode;
}) {
  return (
    <span
      className={`px-1 py-px text-[10px] font-normal normal-case tracking-normal ${
        tone === "brand"
          ? "bg-brand-tint text-brand-deep"
          : "bg-neutral-500/10 text-neutral-700"
      }`}
    >
      {children}
    </span>
  );
}

/**
 * An inline caveat — a parity divergence, an unverified basis, a blocking
 * fault.
 *
 * The corridor had five spellings of this one state: `text-amber-800`,
 * `-900` and `-700`, on `bg-amber-500/10` and `/20`, plus `text-warning` in
 * the tab bar. It now uses the token the design system defines
 * (`--color-warning`, #b45309, documented as AA on white) so a caveat looks
 * the same wherever it appears.
 */
export function Note({
  bordered = false,
  className = "",
  children,
}: {
  /** A blocking fault gets a border; an aside inside a card does not. */
  bordered?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      className={`bg-warning/10 px-2 py-1.5 text-xs leading-snug text-warning ${
        bordered ? "border border-warning/40" : ""
      } ${className}`}
    >
      {children}
    </p>
  );
}

/**
 * A label, a number, and an optional sub-line.
 *
 * `tabular-nums` sits on the WRAPPER so the value and its unit share one
 * numeric alignment — a figure and its suffix drifting apart is the small
 * thing that makes a KPI row look unconsidered.
 *
 * `tone="strong"` is for the one headline figure per group. It is a size and
 * colour change, not a weight change, so it reads as hierarchy rather than
 * emphasis-by-bolding.
 */
export function Stat({
  label,
  value,
  sub,
  subTone = "muted",
  tone = "default",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** `warn` marks a caveat on the figure — a divergence, a stale basis. */
  subTone?: "muted" | "warn";
  tone?: "default" | "strong";
}) {
  return (
    <div className="tabular-nums">
      <SectionLabel>{label}</SectionLabel>
      <p
        className={
          tone === "strong"
            ? "mt-1 text-2xl font-semibold tracking-tight text-brand-deep"
            : "mt-1 text-lg font-semibold text-neutral-900"
        }
      >
        {value}
      </p>
      {sub && (
        <p
          className={
            subTone === "warn"
              ? "mt-0.5 text-xs font-medium text-warning"
              : "mt-0.5 text-xs text-neutral-500"
          }
        >
          {sub}
        </p>
      )}
    </div>
  );
}
