"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

const LINKS = [
  { href: "/explorer", key: "explorer" },
  { href: "/corridor", key: "corridor" },
  { href: "/methodology", key: "methodology" },
] as const;

export default function TopBar() {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-12 items-center gap-4 border-b border-neutral-200 bg-white/95 px-4 backdrop-blur">
      <Link href="/explorer" className="flex items-baseline gap-2">
        <span className="text-sm font-semibold tracking-tight">
          {t("app.name")}
        </span>
        <span className="hidden text-xs text-neutral-500 sm:inline">
          {t("app.tagline")}
        </span>
      </Link>
      <nav className="flex flex-1 items-center gap-1">
        {LINKS.map((l) => {
          const active = pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`rounded px-2.5 py-1 text-sm transition-colors ${
                active
                  ? "bg-neutral-100 font-medium text-neutral-900"
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
