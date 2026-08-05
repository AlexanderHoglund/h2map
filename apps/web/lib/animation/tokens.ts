import type { Palette, PaletteRequest } from "./types";

/**
 * CSS custom properties → concrete strings for canvas.
 *
 * Canvas cannot parse `var(--x)`: assigning it to `fillStyle` is *silently
 * ignored*, leaving whatever colour was set before — so a typo shows up as
 * the wrong colour rather than an error. Hence every request carries a
 * literal fallback and we reject anything that still looks like a `var()`.
 *
 * Resolution happens ONCE per canvas, in the init effect. `getComputedStyle`
 * forces a style recalculation, so it must never run per frame or per key.
 *
 * No invalidation exists because the app is light-only (`color-scheme: light`
 * in globals.css, no theme switcher). If a theme toggle ever lands, re-running
 * `resolvePalette` into the loop's state ref is the whole fix.
 */

function readVar(style: CSSStyleDeclaration, prop: string, fallback: string): string {
  const value = style.getPropertyValue(prop).trim();
  // Empty = undefined property. A nested `var()` would be equally unusable to
  // canvas, and all current tokens are literal hex, so treat both as missing.
  if (value.length === 0 || value.includes("var(")) return fallback;
  return value;
}

/** Resolve a scene's declared colours against the document root. */
export function resolvePalette<K extends string>(
  requests: readonly PaletteRequest<K>[],
): Palette<K> {
  const style = getComputedStyle(document.documentElement);
  const out = {} as Record<K, string>;
  for (const request of requests) {
    out[request.key] = readVar(style, request.prop, request.fallback);
  }
  return Object.freeze(out);
}

/** The app's monospace family, for `ctx.font` (which cannot take `var()`). */
export function resolveMonoFont(): string {
  const style = getComputedStyle(document.documentElement);
  return readVar(style, "--font-mono", "monospace");
}
