import type { DesignSpace } from "./types";

/**
 * Design-space → device transform: the canvas equivalent of an SVG
 * `viewBox` + `preserveAspectRatio`.
 *
 * Composed AFTER the device-pixel-ratio transform, so the full chain is
 * `device = dpr × scale × design`. A scene then draws in its own coordinates
 * (the shipping scene uses the SVG's 900×1000) and everything else follows.
 */

/** Retina beyond 2× is invisible on linework and costs 2.25× the fill rate. */
export const MAX_DPR = 2;

/** Clamped device pixel ratio for the current display. */
export function deviceRatio(): number {
  return Math.min(window.devicePixelRatio || 1, MAX_DPR);
}

/**
 * Centre the design space in the element and scale it to cover ("slice") or
 * contain ("meet").
 *
 * Two consequences worth knowing:
 *  - **Line widths scale.** A `lineWidth` of 1.5 in design space renders at
 *    1.5 × scale device px. SVG behaves identically inside a scaled viewBox,
 *    so this is what keeps a port faithful — but a hairline can go sub-pixel
 *    and grey out at small sizes.
 *  - **"slice" crops.** Do not add `ctx.clip()` to contain it: the browser
 *    already discards geometry outside the canvas, and a clip path costs
 *    per-frame state for nothing.
 */
export function applyDesignTransform(
  ctx: CanvasRenderingContext2D,
  space: DesignSpace,
  cssWidth: number,
  cssHeight: number,
): void {
  const sx = cssWidth / space.width;
  const sy = cssHeight / space.height;
  const scale = space.fit === "slice" ? Math.max(sx, sy) : Math.min(sx, sy);
  ctx.translate((cssWidth - space.width * scale) / 2, (cssHeight - space.height * scale) / 2);
  ctx.scale(scale, scale);
}
