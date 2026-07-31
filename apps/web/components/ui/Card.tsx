"use client";

/**
 * Surface primitives. The elevation story: white cards with hairline borders
 * and shadow-sm sit on the off-white page — nothing else floats.
 */

/** Plain white card. */
export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border border-neutral-200 bg-white p-3 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

/** Titled card whose body is a responsive two-column field grid. */
export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/** Collapsed fold for secondary fields (dashed border, micro-label summary). */
export function Advanced({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <details className="rounded-lg border border-dashed border-neutral-300 bg-white p-3">
      <summary className="cursor-pointer select-none text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div>
    </details>
  );
}
