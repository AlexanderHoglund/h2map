import type { Metadata } from "next";
import GalleryClient from "@/components/animate/GalleryClient";
import Footer from "@/components/shell/Footer";
import TopBar from "@/components/shell/TopBar";

export const metadata: Metadata = { title: "Animations — Thaduberg" };

/**
 * The canvas animation gallery: a workbench for developing the visual
 * language. Each entry is a complete animation; pick one to watch it.
 *
 * DO NOT add `requireAccess()` here. Most content pages open with it
 * (`app/docs/page.tsx`, `app/about/data/page.tsx`), so copy-pasting one as a
 * template is the easy mistake — and it would gate this page even though
 * `proxy.ts` whitelists `/animate`, because `requireAccess()` redirects on its
 * own. Covered by `e2e/animate.anon.spec.ts`.
 */
export default function AnimatePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 text-sm leading-6">
        <h1 className="text-2xl font-semibold tracking-tight">Animations</h1>
        <p className="mt-2 max-w-2xl text-neutral-600">
          Canvas-2D studies in the technical-drawing style — straight lines, right
          angles, everything on a shared grid. Motion pauses when a piece scrolls out
          of view or the tab is hidden, and holds a still frame when the system asks
          for reduced motion.
        </p>
        <GalleryClient />
      </main>
      <Footer />
    </div>
  );
}
