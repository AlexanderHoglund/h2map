import type { Scene } from "@/lib/animation/types";
import { shippingScene } from "./scenes/shipping";

/**
 * The animations, in display order.
 *
 * Each entry holds a `Scene` — data, not a component. That is what keeps the
 * gallery to a single module-scope component: there is nothing here that
 * could accidentally be defined inside a render (`react-hooks/static-components`).
 *
 * Adding an animation is one `scenes/*.ts` module and one line here. No new
 * component, no new route, no new client boundary.
 */

export interface AnimationEntry {
  readonly id: string;
  readonly title: string;
  /** One line: what it is, and which technique it demonstrates. */
  readonly description: string;
  readonly scene: Scene;
}

/** Typed as non-empty so `ANIMATIONS[0]` needs no guard under
 *  `noUncheckedIndexedAccess`. */
export const ANIMATIONS: readonly [AnimationEntry, ...AnimationEntry[]] = [
  {
    id: "shipping",
    title: "Two-port shipping corridor",
    description:
      "Canvas port of the entry-panel schematic. Marching route dashes, and three ships positioned by arc length along the polyline — the canvas equivalent of CSS offset-path.",
    scene: shippingScene,
  },
];
