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
      "Book & claim as a diagram. Left: the green ore corridor, its whole environmental value aboard as one large unit. Centre: the registry splits it into three standardized EACs, pooled by a demand aggregator whose commitments flow back to finance the fuel. Right: each unit docks onto a cargo owner's shipment of cars — the cargo sails visibly decarbonized and the claim retires at delivery. The ledger always sums to three.",
    scene: decouplingScene,
  },
];
