import type { Scene } from "@/lib/animation/types";
import { decouplingScene } from "./scenes/decoupling";
import { regulationsScene } from "./scenes/regulations";
import { shippingScene } from "./scenes/shipping";
import { stackScene } from "./scenes/stack";

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
      "Wind and solar into electrolysis, synthesis and storage, then export by sea. Turbines turn, flow marches along the pipelines, and the green fleet runs a closed circuit — laden out, ballast back. A passenger tier runs beside the cargo: cruise ships between two terminals (one liner still on conventional bunkers, kept white), boarding bridges that reach out only while a ship is alongside, buses to both terminals, and passengers on foot down the walkways.",
    scene: shippingScene,
  },
  {
    id: "decoupling",
    title: "One voyage, many buyers",
    description:
      "Book & claim on the actual world map. Clean ammonia is made in the Pilbara and bunkers one iron-ore voyage to Korea — the green vessel on the solid route. Its environmental attribute books into the registry, fills the demand aggregator's pool slot by slot, and goes out to every cargo owner on the chart — companies inland of ports on entirely different trades. Everything else is dashed — other trades, other ships.",
    scene: decouplingScene,
  },
  {
    id: "stack",
    title: "Three blocks, one system",
    description:
      "The corridor as a stacked schematic: two generic ports trading cargo on top, fuel production in the middle, energy production at the base. Power marches up into electrolysis, fuel rises to a loading arm at both quays — and the production blocks are sited nowhere in particular: no coastlines, no country names, just the process.",
    scene: stackScene,
  },
  {
    id: "regulations",
    title: "Three rules, one lever",
    description:
      "The mechanism every maritime climate rule shares, in one drawing: make the fossil voyage dearer until the green one wins. EU ETS, FuelEU Maritime and the IMO Net-Zero Framework — each card quoting its real price — take turns dropping charge slabs onto the fossil cost column, which starts cheap and does not stay that way. The green column starts dear and holds still. The moment the stack crosses the dashed GREEN TOTAL line, the cargo changes ships below: the fleet follows the cheaper fuel.",
    scene: regulationsScene,
  },
];
