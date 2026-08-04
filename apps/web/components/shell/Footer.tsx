import Link from "next/link";
import { useTranslations } from "next-intl";

export default function Footer() {
  const t = useTranslations("footer");
  return (
    <footer className="mt-12 border-t border-neutral-300 py-6 text-xs text-neutral-500">
      <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4">
        <span>{t("methodology")}</span>
        <span>
          {t("dataProviders")} ·{" "}
          <Link
            href="/about/data"
            className="underline underline-offset-2 hover:text-brand"
          >
            {t("aboutData")} →
          </Link>
        </span>
        {/* Legal notices. The landing page carries its own copy of these links
            (it is fixed-height and cannot take this footer) — see LandingClient. */}
        <span>
          <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-brand">
            {t("privacy")}
          </Link>{" "}
          ·{" "}
          <Link href="/legal/cookies" className="underline underline-offset-2 hover:text-brand">
            {t("cookies")}
          </Link>
        </span>
      </div>
    </footer>
  );
}
