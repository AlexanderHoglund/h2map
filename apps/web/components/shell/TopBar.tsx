"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

const LINKS = [
  { href: "/explorer", key: "explorer" },
  { href: "/calculator", key: "calculator" },
  { href: "/scenarios", key: "scenarios" },
] as const;

export default function TopBar() {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-12 items-center gap-4 border-b border-neutral-200 bg-white/95 px-4 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
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
                  ? "bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-50"
                  : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
              }`}
            >
              {t(`nav.${l.key}`)}
            </Link>
          );
        })}
      </nav>
      <button
        type="button"
        disabled
        title="More languages coming"
        className="rounded px-2 py-1 text-xs text-neutral-400"
      >
        {t("nav.language")}
      </button>
      <Link
        href="/scenarios"
        className="rounded border border-neutral-300 px-2.5 py-1 text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        {t("nav.signIn")}
      </Link>
    </header>
  );
}
