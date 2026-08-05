"use client";

import { useCanvas2D } from "@/lib/animation/useCanvas2D";
import { useReducedMotion } from "@/lib/animation/useReducedMotion";
import type { Scene } from "@/lib/animation/types";

/**
 * The only component in the app that touches a `<canvas>`. Every animation is
 * a `Scene` rendered through this one component, which is what keeps the
 * gallery free of per-entry components.
 *
 * IMPORTANT — the parent must give this a definite height. A canvas has no
 * intrinsic size, so as a flex or grid child with `h-full` and no sized
 * ancestor it collapses to 0×0 and renders blank *with no error*. If you see
 * an empty box, check the container's height before anything else.
 *
 * `width`/`height` attributes are deliberately not set here: the hook owns
 * the backing store (assigning `canvas.width` also clears it), and React
 * re-rendering those attributes would fight it.
 */
export default function AnimationCanvas({
  scene,
  className = "",
}: {
  scene: Scene;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const canvasRef = useCanvas2D(scene, { reducedMotion });

  return (
    // Decorative, exactly like the SVG it ports: the content is unavailable
    // to assistive tech either way, and the meaning lives in the text beside it.
    // `block` because a canvas is inline by default, which leaves a descender
    // gap under it inside a sized box.
    <canvas ref={canvasRef} aria-hidden className={`block h-full w-full ${className}`} />
  );
}
