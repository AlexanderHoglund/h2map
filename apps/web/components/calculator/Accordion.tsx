"use client";

import { useId, useState } from "react";

/**
 * Accordion section: collapsible header (real heading + disclosure button
 * wired to its panel via aria-controls / aria-labelledby) with a "modified"
 * dot when the section's values differ from the reference defaults, plus a
 * per-section reset link.
 */
export function Section({
  title,
  dirty,
  dirtyLabel,
  resetLabel,
  onReset,
  defaultOpen = true,
  children,
}: {
  title: string;
  dirty: boolean;
  dirtyLabel: string;
  resetLabel: string;
  onReset: () => void;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const headerId = useId();
  const panelId = useId();

  return (
    <section className="rounded-lg border border-neutral-200 bg-white">
      <div className="flex items-center gap-2 px-4 py-3">
        <h2 className="contents">
          <button
            type="button"
            id={headerId}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={panelId}
            className="flex flex-1 items-center gap-2 rounded-sm text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              className={`h-3.5 w-3.5 text-neutral-400 transition-transform duration-150 ease-out ${open ? "rotate-90" : ""}`}
            >
              <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {title}
            {dirty ? (
              <span
                title={dirtyLabel}
                aria-label={dirtyLabel}
                className="h-1.5 w-1.5 rounded-full bg-brand"
              />
            ) : null}
          </button>
        </h2>
        {dirty ? (
          <button
            type="button"
            onClick={onReset}
            className="rounded-sm text-xs text-neutral-500 underline underline-offset-2 transition-colors duration-150 ease-out hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            {resetLabel}
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          id={panelId}
          role="region"
          aria-labelledby={headerId}
          className="border-t border-neutral-100 px-4 py-4"
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
