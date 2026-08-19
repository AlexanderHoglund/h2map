"use client";

import { useId, useState } from "react";

/**
 * Small "?" affordance: a focusable button with a hand-rolled popover shown
 * on hover and keyboard focus (dismissed on blur / mouse-leave / Escape).
 *
 * QUIET UNTIL THE FIELD IS HOVERED. Every input in the app carries one of
 * these, so an always-on "?" per field would be sixty little badges of
 * chrome. The button fades in when the pointer is over the field (the field
 * components mark their root `group/field`) and whenever it holds keyboard
 * focus — it is in the tab order regardless, so keyboard users find it
 * without a mouse.
 */
export function Help({
  text,
  reveal = true,
}: {
  text: string;
  /**
   * true (default): fade in when the surrounding `group/field` is hovered —
   * the input-field behaviour. false: always visible, for the few "?"
   * markers that sit on RESULT rows with no field to hover.
   */
  reveal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={text}
        aria-describedby={open ? tooltipId : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className={`inline-flex h-4 w-4 cursor-help select-none items-center justify-center rounded-full border border-neutral-300 text-[10px] leading-none text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
          reveal
            ? "opacity-0 transition-opacity duration-150 ease-out focus:opacity-100 group-hover/field:opacity-100"
            : ""
        }`}
      >
        ?
      </button>
      {open ? (
        <div
          id={tooltipId}
          role="tooltip"
          className="absolute left-0 top-full z-20 mt-1.5 w-64 rounded-md border border-neutral-300 bg-white/95 px-2.5 py-1.5 text-xs font-normal normal-case leading-snug text-neutral-600 shadow-md backdrop-blur"
        >
          {text}
        </div>
      ) : null}
    </span>
  );
}
