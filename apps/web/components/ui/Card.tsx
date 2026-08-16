"use client";

/**
 * Surface primitives. The elevation story: white cards with hairline borders
 * and sit on the off-white page — nothing else floats.
 */

/**
 * Plain white card.
 *
 * `as` exists so a card can keep its landmark: the results panel's blocks are
 * `<section>`s, and swapping them for `<div>`s to gain a shared style would
 * trade screen-reader structure for visual consistency. Defaults to `div`,
 * so every existing caller is unaffected.
 */
export function Card({
  as: Tag = "div",
  className = "",
  children,
}: {
  as?: "div" | "section";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tag
      className={`rounded-lg border border-neutral-300 bg-white p-3 ${className}`}
    >
      {children}
    </Tag>
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
    <section className="rounded-lg border border-neutral-300 bg-white p-3">
      {/* Inside the corridor workspace the cascade sets --tone-text to the
          active tab's AA-darkened domain colour; everywhere else the
          fallback keeps the heading neutral ink. */}
      <h3 className="mb-3 text-sm font-semibold text-(--tone-text,#171717)">
        {title}
      </h3>
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
    <details className="group rounded-lg border border-dashed border-neutral-300 bg-white p-3">
      <summary className="flex cursor-pointer select-none items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500 transition-colors hover:text-neutral-700 [&::-webkit-details-marker]:hidden [&::marker]:content-['']">
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          className="h-3 w-3 shrink-0 transition-transform group-open:rotate-90"
          fill="currentColor"
        >
          <path d="M6 3.5 11 8l-5 4.5v-9Z" />
        </svg>
        {label}
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div>
    </details>
  );
}
