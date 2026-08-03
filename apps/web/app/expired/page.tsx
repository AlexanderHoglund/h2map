import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getServerComponentSupabase } from "@/lib/supabase/server";
import ExpiredActions from "./ExpiredActions";

export const metadata: Metadata = { title: "Access expired — Thaduberg" };

/**
 * The lockout screen for expired trial/teaching accounts: session required
 * but access is not (an access-gated /expired would loop). Scenarios are
 * KEPT — an admin extension restores everything with no data motion.
 */
export default async function ExpiredPage() {
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/");
  const t = await getTranslations("auth.expired");

  return (
    <main className="bg-plus-grid flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md border border-neutral-300 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold">{t("heading")}</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600">{t("body")}</p>
        <p className="mt-2 text-sm text-neutral-600">{t("dataKept")}</p>
        <ExpiredActions />
      </div>
    </main>
  );
}
