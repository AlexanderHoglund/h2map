import type { Scene } from "@/lib/animation/types";
import { decouplingScene } from "./scenes/decoupling";
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
    title: "Green corridor, end to end",
    description:
      "Wind and solar into electrolysis, synthesis and storage, then export by sea. Turbines turn, flow marches along the pipelines, and the fleet runs a closed circuit — laden out, ballast back.",
    scene: shippingScene,
  },
  {
    id: "decoupling",
    title: "Decoupling: book and claim",
    description:
      "Iron ore sails Port Hedland to Gwangyang on green fuel; the fuel's environmental attribute detaches as a certificate, passes through the registry, and a conventional car carrier claims it — the green exists in exactly one place at every moment.",
    scene: decouplingScene,
  },
];
