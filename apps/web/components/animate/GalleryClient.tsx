"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { ANIMATIONS } from "./registry";

/**
 * The gallery: pick an animation from the list, watch it play.
 *
 * This file is the client boundary. `ssr: false` throws from a Server
 * Component, so the dynamic import has to live here — the same constraint
 * `components/landing/LandingClient.tsx` documents. Canvas is browser-only,
 * and keeping it client-side also guarantees the first paint is the
 * reduced-motion still rather than a hydration mismatch.
 */
const AnimationCanvas = dynamic(() => import("./AnimationCanvas"), { ssr: false });

export default function GalleryClient() {
  const [selectedId, setSelectedId] = useState(ANIMATIONS[0].id);
  const entry = ANIMATIONS.find((a) => a.id === selectedId) ?? ANIMATIONS[0];

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[18rem_1fr]">
      {/* The list */}
      <nav aria-label="Animations">
        <ul className="border border-neutral-300 bg-white">
          {ANIMATIONS.map((a) => {
            const active = a.id === entry.id;
            return (
              <li key={a.id} className="border-b border-neutral-200 last:border-0">
                <button
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  aria-current={active ? "true" : undefined}
                  className={`w-full px-3 py-3 text-left transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-brand/40 ${
                    active
                      ? "bg-brand-tint text-brand-deep"
                      : "text-neutral-800 hover:bg-neutral-100"
                  }`}
                >
                  <span className="block text-sm font-medium">{a.title}</span>
                  <span
                    className={`mt-0.5 block text-xs leading-snug ${
                      active ? "text-brand-deep/80" : "text-neutral-500"
                    }`}
                  >
                    {a.description}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* The stage */}
      <section aria-labelledby="stage-title">
        <h2 id="stage-title" className="text-base font-semibold text-neutral-900">
          {entry.title}
        </h2>
        <p className="mt-1 max-w-2xl text-neutral-600">{entry.description}</p>
        {/* The canvas has no intrinsic size — this box's aspect ratio IS its
            height. Without a definite height here it collapses to 0 and
            renders blank. bg-white also gives axe a resolvable background. */}
        <div className="mt-3 aspect-[9/10] w-full max-w-xl border border-neutral-300 bg-white">
          {/* Remount on change: full teardown, fresh init, clock back to zero. */}
          <AnimationCanvas key={entry.id} scene={entry.scene} />
        </div>
      </section>
    </div>
  );
}
