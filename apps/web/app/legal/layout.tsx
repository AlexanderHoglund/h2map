import Footer from "@/components/shell/Footer";
import TopBar from "@/components/shell/TopBar";

/**
 * Shared chrome for the legal notices (privacy, cookies; imprint later).
 *
 * DO NOT add `requireAccess()` here or in any page below it. Every other
 * content page opens with it (`app/docs/page.tsx`, `app/about/data/page.tsx`),
 * so copy-pasting one as a template is the easy mistake — and it would re-gate
 * these pages even though `proxy.ts` whitelists `/legal/`, because
 * `requireAccess()` redirects on its own. The audience for a privacy notice is
 * precisely the visitor who has NOT signed in. Covered by
 * `e2e/legal.anon.spec.ts`.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 text-sm leading-6">
        {children}
      </main>
      <Footer />
    </div>
  );
}
