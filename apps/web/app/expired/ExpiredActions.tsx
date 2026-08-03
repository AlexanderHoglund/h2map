"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/Button";

export default function ExpiredActions() {
  const t = useTranslations("auth.expired");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <div className="mt-5 flex flex-wrap gap-2">
      <Button
        variant="primary"
        size="md"
        onClick={() => {
          window.location.href = `mailto:${t("contactEmail")}?subject=${encodeURIComponent(t("contactSubject"))}`;
        }}
      >
        {t("contact")}
      </Button>
      <Button
        size="md"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await getBrowserSupabase().auth.signOut();
          router.push("/");
          router.refresh();
        }}
      >
        {t("signOut")}
      </Button>
    </div>
  );
}
