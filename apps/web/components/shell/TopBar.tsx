"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Slim bar for CONTENT pages (methodology, about, parity). The integrated
 * corridor workspace has its own bar with the five steps — this one just
 * gets the reader back to the model.
 */
const LINKS = [
  { href: "/corridor", key: "corridor" },
  { href: "/methodology", key: "methodology" },
] as const;

export default function TopBar() {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <header className="flex h-12 items-center gap-4 border-b border-neutral-300 bg-white px-4">
      <Link href="/corridor" className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative SVG */}
        <img src="/thaduberg-mark.svg" alt="" className="h-7 w-auto" />
        <span className="flex items-baseline gap-2">
          <span className="text-sm font-semibold tracking-tight">
            {t("app.name")}
          </span>
          <span className="hidden text-xs text-neutral-500 sm:inline">
            {t("app.tagline")}
          </span>
        </span>
      </Link>
      <nav className="flex flex-1 items-center justify-end gap-1">
        {LINKS.map((l) => {
          const active = pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`px-2.5 py-1 text-sm transition-colors ${
                active
                  ? "bg-brand-tint font-medium text-brand-deep"
                  : "text-neutral-500 hover:text-neutral-900"
              }`}
            >
              {t(`nav.${l.key}`)}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
