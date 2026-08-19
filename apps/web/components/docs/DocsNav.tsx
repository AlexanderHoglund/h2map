"use client";

/**
 * The documentation's persistent left navigation.
 *
 * The page's only navigation used to be a Contents block at the top of the
 * body, which scrolls away the moment you start reading — so returning from
 * §22 to §9 meant scrolling to the top or using browser find. This stays put,
 * shows where you are, and links one level deeper than the section headings so
 * "take me to FuelEU Maritime" lands on FuelEU Maritime rather than on the top
 * of a seven-part Regulation section.
 *
 * A CLIENT ISLAND on an otherwise server-rendered page: `docs/page.tsx` awaits
 * `requireAccess()` and must stay a server component, so it renders this and
 * passes the tree down as data.
 *
 * The links are plain `<a href="#id">`. That is deliberate — they work before
 * hydration, and the browser puts the anchor in the address bar for free, which
 * is what makes a link copy-pasteable.
 */

import React, { useEffect, useState } from "react";
import type { TocPart } from "@/app/docs/toc";

export default function DocsNav({
  parts,
  ids,
}: {
  parts: readonly TocPart[];
  /** Every heading id in document order — the scroll-spy's observe list. */
  ids: readonly string[];
}) {
  const [active, setActive] = useState<string | null>(null);
  /**
   * A section the reader has opened by hand, which overrides the scroll-spy.
   *
   * Without this, children were reachable ONLY by scrolling to their parent:
   * the expansion followed the observer and nothing else, so a reader could
   * see that "9. Regulation" existed but had no way to open it and jump
   * straight to "FuelEU Maritime". Null = follow the scroll, which is the
   * behaviour once you start reading again.
   */
  const [opened, setOpened] = useState<string | null>(null);
  /**
   * Set when the reader collapses a section by hand, so the scroll-spy does
   * not immediately re-open the very section they just closed. Cleared as
   * soon as they open something else or scroll into a different section.
   */
  const [collapsed, setCollapsed] = useState<string | null>(null);

  useEffect(() => {
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        // The FIRST id in document order that is currently on screen, so the
        // highlight tracks what you are reading rather than whichever heading
        // happened to fire last — observer callbacks arrive unordered.
        const first = ids.find((id) => seen.get(id));
        if (first) setActive(first);
      },
      {
        // Biased hard to the top: a heading counts as "current" once it
        // reaches the upper strip of the viewport, not when it leaves the
        // bottom. Without this the highlight lags a full section behind.
        rootMargin: "-64px 0px -80% 0px",
        threshold: 0,
      },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids]);

  /** The section owning the active id — a sub-heading keeps its parent open. */
  const activeSection = parts
    .flatMap((p) => p.sections)
    .find((s) => s.id === active || (s.children ?? []).some((c) => c.id === active));
  /**
   * Hand-opened wins; otherwise whatever you are reading is open — unless the
   * reader just collapsed that very section, in which case it stays shut.
   */
  const spyId = activeSection?.id ?? null;
  const openId = opened ?? (collapsed !== null && collapsed === spyId ? null : spyId);

  return (
    <nav
      aria-label="Documentation sections"
      className="sticky top-0 hidden max-h-dvh w-64 shrink-0 self-start overflow-y-auto py-10 pr-2 lg:block"
    >
      {parts.map((part) => (
        <div key={part.title} className="mb-6 last:mb-0">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            {part.title}
          </p>
          <ul className="space-y-0.5">
            {part.sections.map((s) => {
              const isActive = s.id === active;
              const isOpen = openId === s.id;
              const hasChildren = (s.children ?? []).length > 0;
              return (
                <li key={s.id}>
                  <div
                    className={`flex items-stretch border-l-2 ${
                      isActive ? "border-brand" : "border-transparent"
                    }`}
                  >
                    <a
                      href={`#${s.id}`}
                      aria-current={isActive ? "location" : undefined}
                      className={`min-w-0 flex-1 py-1 pl-3 text-[13px] leading-snug transition-colors ${
                        isActive
                          ? "font-medium text-brand-deep"
                          : "text-neutral-600 hover:text-neutral-900"
                      }`}
                    >
                      {s.label}
                    </a>
                    {/* A SEPARATE control, so clicking the label still
                        navigates. Making the whole row a toggle would have
                        cost the section link, which is the common case. */}
                    {hasChildren && (
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? "Collapse" : "Expand"} ${s.label}`}
                        onClick={() => {
                          if (isOpen) {
                            setOpened(null);
                            setCollapsed(s.id);
                          } else {
                            setOpened(s.id);
                            setCollapsed(null);
                          }
                        }}
                        className="shrink-0 px-2 text-neutral-400 transition-colors hover:text-neutral-800"
                      >
                        <span
                          aria-hidden
                          className={`block text-[10px] leading-none transition-transform ${
                            isOpen ? "rotate-90" : ""
                          }`}
                        >
                          &#9654;
                        </span>
                      </button>
                    )}
                  </div>
                  {isOpen && s.children && (
                    <ul className="mb-1 space-y-0.5">
                      {s.children.map((c) => {
                        const childActive = c.id === active;
                        return (
                          <li key={c.id}>
                            <a
                              href={`#${c.id}`}
                              aria-current={childActive ? "location" : undefined}
                              className={`block border-l-2 py-0.5 pl-6 text-[12px] leading-snug transition-colors ${
                                childActive
                                  ? "border-brand font-medium text-brand-deep"
                                  : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-800"
                              }`}
                            >
                              {c.label}
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
