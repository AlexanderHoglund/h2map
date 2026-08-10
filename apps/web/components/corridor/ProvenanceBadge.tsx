"use client";

import { useId, useState } from "react";

/**
 * The source badge as a provenance affordance (sprint 3, task 2): hovering
 * or focusing the badge answers "where does this number come from?". Same
 * hand-rolled popover pattern as ui/Help — hover + keyboard focus, Escape
 * dismisses, role=tooltip — so the two read as one family. Without a
 * provenance text it stays the plain badge it always was.
 */
export function ProvenanceBadge({
  label,
  className,
  provenance,
}: {
  label: string;
  className: string;
  provenance?: string;
}) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  if (!provenance) {
    return (
      <span
        className={`px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${className}`}
      >
        {label}
      </span>
    );
  }

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`${label}: ${provenance}`}
        aria-describedby={open ? tooltipId : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className={`cursor-help px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${className}`}
      >
        {label}
      </button>
      {open ? (
        <div
          id={tooltipId}
          role="tooltip"
          className="absolute right-0 top-full z-20 mt-1.5 w-64 rounded-md border border-neutral-300 bg-white/95 px-2.5 py-1.5 text-left text-xs font-normal normal-case tracking-normal text-neutral-600 shadow-md backdrop-blur"
        >
          {provenance}
        </div>
      ) : null}
    </span>
  );
}
