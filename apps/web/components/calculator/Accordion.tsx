"use client";

import { useState } from "react";

/**
 * Accordion section: collapsible header with a "modified" dot when the
 * section's values differ from the reference defaults, plus a per-section
 * reset link.
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

  return (
    <section className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-2 text-left text-sm font-semibold"
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
              className="h-1.5 w-1.5 rounded-full bg-blue-600"
            />
          ) : null}
        </button>
        {dirty ? (
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-neutral-500 underline-offset-2 transition-colors duration-150 ease-out hover:text-blue-600 hover:underline"
          >
            {resetLabel}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="border-t border-neutral-100 px-4 py-4 dark:border-neutral-800/60">
          {children}
        </div>
      ) : null}
    </section>
  );
}
