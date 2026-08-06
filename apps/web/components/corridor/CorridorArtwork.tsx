"use client";

import AnimationCanvas from "@/components/animate/AnimationCanvas";
import { shippingScene } from "@/components/animate/scenes/shipping";
import type { Scene } from "@/lib/animation/types";

/**
 * The entry panel is a tall half-screen, and "slice" (cover) crops the scene
 * to fill it — which cuts Rotterdam and the return lane off the right edge.
 * As artwork the whole composition matters more than filling every pixel, so
 * this instance contains rather than covers.
 */
const framedScene: Scene = {
  ...shippingScene,
  space: { ...shippingScene.space, fit: "meet" },
};

/**
 * The entry-panel artwork: the green-corridor schematic, animated.
 *
 * Replaces the static SVG that used to live in `ShippingCanvas.tsx`. Both
 * panels that host it are full-height with `overflow-hidden`, which gives the
 * canvas the definite height it needs — a canvas has no intrinsic size and
 * collapses to nothing in an unsized box.
 *
 * The host panel carries `.bg-plus-grid`. The canvas paints its own chart
 * mesh and is transparent over water, so that texture would show through and
 * fight it; the wrapper lays down the page colour first. Cheaper and more
 * predictable than removing the class from the callers, which also style the
 * panel's border and layout.
 */
export default function CorridorArtwork() {
  return (
    <div className="bg-page absolute inset-0">
      <AnimationCanvas scene={framedScene} />
    </div>
  );
}
