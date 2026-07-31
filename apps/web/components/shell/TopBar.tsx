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
  { href: "/docs", key: "documentation" },
  { href: "/methodology", key: "methodology" },
] as const;

export default function TopBar() {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <header className="flex h-12 items-center gap-4 border-b border-neutral-300 bg-white px-4">
      <Link href="/corridor" className="flex flex-col items-start justify-center gap-1">
        {/* Small mark with the name BELOW the wave (the lockup's layout) */}
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative SVG */}
        <img src="/thaduberg-mark.svg" alt="" className="h-4 w-auto" />
        <span className="text-[11px] font-semibold leading-none tracking-tight">
          {t("app.name")}
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
