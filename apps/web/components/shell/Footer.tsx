import Link from "next/link";
import { useTranslations } from "next-intl";

export default function Footer() {
  const t = useTranslations("footer");
  return (
    <footer className="mt-12 border-t border-neutral-200 py-6 text-xs text-neutral-500">
      <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4">
        <span>{t("methodology")}</span>
        <span>
          {t("dataProviders")} ·{" "}
          <Link href="/about/data" className="underline hover:text-neutral-700">
            {t("aboutData")}
          </Link>
        </span>
      </div>
    </footer>
  );
}
