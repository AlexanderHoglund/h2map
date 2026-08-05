"use client";

import { useEffect, useRef } from "react";
import { applyDesignTransform, deviceRatio } from "./space";
import { resolveMonoFont, resolvePalette } from "./tokens";
import type { Palette, Scene } from "./types";

/**
 * The frame loop: DPR scaling, resize handling, and the three motion-safety
 * gates, so an individual scene cannot forget any of them.
 *
 * Returns ONLY a ref — no state. That is deliberate and load-bearing: the
 * loop mutates a ref and paints, never calling a setter, which is what keeps
 * `react-hooks/set-state-in-effect` satisfied. If you later need to surface a
 * loop value to React (an FPS readout, elapsed time), do NOT add a setState
 * here: write to a DOM node's textContent from the loop, or throttle a
 * setState to a few Hz behind an explicit guard. Never per frame.
 *
 * Lifecycle follows the house pattern from `components/hexplorer/HexplorerMap.tsx`
 * (init-once guard, rAF-coalesced ResizeObserver, teardown in reverse order)
 * and the "latest value in a ref" trick from `components/calculator/MiniMap.tsx`
 * so the init effect has stable deps and never re-runs.
 */

/** A long frame (a background tab that slipped through, a GC pause) must not
 *  jump the clock — cap the step at ~4 frames' worth. */
const MAX_DELTA_S = 1 / 15;

export interface Canvas2DOptions {
  /** Freeze to a single still frame. Pass the `useReducedMotion()` result. */
  readonly reducedMotion: boolean;
  /** Keep running while off-screen. Off by default — the viewport gate saves real CPU. */
  readonly alwaysRun?: boolean;
}

interface LoopState {
  raf: number;
  /** Timestamp of the previous frame; null while paused or never started. */
  last: number | null;
  /** Accumulated *running* seconds — the scene's clock. */
  clock: number;
  visible: boolean;
  hidden: boolean;
  palette: Palette;
  font: string;
  dpr: number;
  cssW: number;
  cssH: number;
}

export function useCanvas2D(
  scene: Scene,
  { reducedMotion, alwaysRun = false }: Canvas2DOptions,
): React.RefObject<HTMLCanvasElement | null> {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Every mutable loop value in ONE ref object: nothing here should trigger a
  // React render, and keeping it in a ref satisfies `refs` + `immutability`.
  const stateRef = useRef<LoopState>({
    raf: 0,
    last: null,
    clock: 0,
    visible: false,
    hidden: false,
    palette: {},
    font: "monospace",
    dpr: 1,
    cssW: 0,
    cssH: 0,
  });

  // Latest values reachable from the init effect without becoming deps.
  const sceneRef = useRef(scene);
  const reducedRef = useRef(reducedMotion);
  // Lets the reducedMotion effect below poke the running loop.
  const syncRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);
  useEffect(() => {
    reducedRef.current = reducedMotion;
  }, [reducedMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const st = stateRef.current;
    const initial = sceneRef.current;

    st.palette = resolvePalette(initial.palette);
    st.font = resolveMonoFont();
    initial.setup?.(initial.space);

    // --- painting ----------------------------------------------------------
    const paint = (still: boolean, delta: number) => {
      const active = sceneRef.current;
      // Reset the transform each frame, then rebuild: device → CSS px → design.
      ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
      ctx.clearRect(0, 0, st.cssW, st.cssH);
      ctx.save();
      applyDesignTransform(ctx, active.space, st.cssW, st.cssH);
      active.draw(ctx, {
        time: st.clock,
        delta,
        palette: st.palette,
        font: st.font,
        still,
      });
      ctx.restore();
    };
    const renderStill = () => paint(true, 0);

    // --- sizing ------------------------------------------------------------
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = deviceRatio();
      if (rect.width === st.cssW && rect.height === st.cssH && dpr === st.dpr) return;
      st.cssW = rect.width;
      st.cssH = rect.height;
      st.dpr = dpr;
      // Assigning width/height also CLEARS the canvas, so repaint immediately.
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      renderStill();
    };

    let resizeRaf = 0;
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(resize);
    });
    resizeObserver.observe(canvas);

    // --- the loop ----------------------------------------------------------
    const tick = (now: number) => {
      // Schedule first: an exception in draw() then leaves the loop alive
      // (a console error storm, which is the signal you want) rather than
      // silently stopping.
      st.raf = requestAnimationFrame(tick);
      const prev = st.last;
      st.last = now;
      const delta = prev === null ? 0 : Math.min((now - prev) / 1000, MAX_DELTA_S);
      st.clock += delta;
      paint(false, delta);
    };

    const shouldRun = () =>
      !reducedRef.current && !st.hidden && (alwaysRun || st.visible);

    const sync = () => {
      if (shouldRun()) {
        if (st.raf === 0) {
          st.last = null; // first frame after a resume has delta 0
          st.raf = requestAnimationFrame(tick);
        }
        return;
      }
      if (st.raf !== 0) {
        cancelAnimationFrame(st.raf);
        st.raf = 0;
      }
      st.last = null; // paused time never accrues
      renderStill(); // leave a correct still frame behind
    };
    syncRef.current = sync;

    // --- gate 1: is it on screen? ------------------------------------------
    const io = new IntersectionObserver(
      (entries) => {
        const latest = entries[entries.length - 1];
        if (!latest) return;
        st.visible = latest.isIntersecting;
        sync();
      },
      { threshold: 0 },
    );
    io.observe(canvas);

    // --- gate 2: is the tab visible? ---------------------------------------
    const onVisibility = () => {
      st.hidden = document.hidden;
      sync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    st.hidden = document.hidden;

    resize(); // sizes and paints frame 0
    sync();

    // Canvas text does not re-render when a webfont arrives (unlike DOM text),
    // so a still frame drawn before Geist Mono loads would stay in fallback
    // Courier forever. One repaint once fonts settle.
    void document.fonts?.ready.then(() => {
      st.font = resolveMonoFont();
      if (st.raf === 0) renderStill();
    });

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      io.disconnect();
      resizeObserver.disconnect();
      cancelAnimationFrame(resizeRaf);
      cancelAnimationFrame(st.raf);
      st.raf = 0;
      st.last = null;
      syncRef.current = null;
    };
  }, [alwaysRun]);

  // Start/stop when the preference changes, without re-initialising.
  useEffect(() => {
    syncRef.current?.();
  }, [reducedMotion]);

  return canvasRef;
}
