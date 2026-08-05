/**
 * Canvas-2D animation engine — the contracts.
 *
 * A *scene* is data plus a draw function, deliberately NOT a React component.
 * That keeps the whole system to exactly one component (`AnimationCanvas`)
 * defined at module scope, so the `react-hooks/static-components` rule is
 * satisfied by construction and adding an animation is one `.ts` file.
 *
 * The engine owns every browser concern — device pixel ratio, resizing, the
 * frame loop, and the three motion-safety gates (reduced motion, hidden tab,
 * off-screen). A scene only draws.
 */

/** A point in the scene's own coordinate system. */
export type Point = readonly [x: number, y: number];

/**
 * The scene's coordinate system — the canvas analogue of an SVG `viewBox`.
 * `fit` mirrors `preserveAspectRatio`: "slice" is cover (crop the overflow),
 * "meet" is contain.
 */
export interface DesignSpace {
  readonly width: number;
  readonly height: number;
  readonly fit: "slice" | "meet";
}

/**
 * Colours resolved from CSS custom properties, keyed by the scene's own names.
 *
 * Generic over the key union so a scene gets `frame.palette.ink` as a plain
 * `string` — an index signature would make every lookup `string | undefined`
 * under `noUncheckedIndexedAccess`, which is 40-odd pointless guards in a draw
 * function. It also turns a mistyped key into a compile error instead of a
 * silently-ignored canvas colour assignment.
 */
export type Palette<K extends string = string> = Readonly<Record<K, string>>;

/**
 * A colour a scene needs. The engine resolves these once at init — a scene
 * must never call `getComputedStyle` itself, since that forces a style
 * recalculation and would run on every frame.
 */
export interface PaletteRequest<K extends string = string> {
  /** The key the scene reads, e.g. "ink" for `frame.palette.ink`. */
  readonly key: K;
  /** The CSS custom property, including the leading dashes: "--anim-ink". */
  readonly prop: string;
  /** Used when the property is missing or empty (SSR, test env, typo). */
  readonly fallback: string;
}

/** Everything one `draw()` call needs. */
export interface Frame<K extends string = string> {
  /**
   * Seconds the scene has been *running*. Time spent paused (hidden tab,
   * scrolled out of view) is excluded, so returning to a 36-second loop
   * resumes where it left off instead of teleporting.
   */
  readonly time: number;
  /** Seconds since the previous drawn frame; 0 on the first frame and after a resume. */
  readonly delta: number;
  readonly palette: Palette<K>;
  /**
   * The resolved monospace family. Canvas cannot parse `var()` in `ctx.font`,
   * so the family is resolved alongside the palette.
   */
  readonly font: string;
  /** True when this frame is a static poster (reduced motion, or paused). */
  readonly still: boolean;
}

export interface Scene<K extends string = string> {
  readonly id: string;
  readonly space: DesignSpace;
  readonly palette: readonly PaletteRequest<K>[];
  /** One-time precomputation (arc lengths, typed arrays). Runs before the first draw. */
  setup?: (space: DesignSpace) => void;
  /**
   * Draw one frame. The context arrives already cleared and already
   * transformed into design space, so a scene draws in its own coordinates
   * and never thinks about DPR or element size.
   *
   * Must be a pure function of `frame` — no `Date.now()`, no `Math.random()`.
   * Anything time-varying comes from `frame.time`, which makes a frame
   * reproducible and the reduced-motion still frame well-defined.
   */
  draw: (ctx: CanvasRenderingContext2D, frame: Frame<K>) => void;
}
