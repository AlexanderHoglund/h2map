"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/Button";

export default function ResetPasswordClient() {
  const t = useTranslations("auth.reset");
  const router = useRouter();
  const id = useId();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getBrowserSupabase()
      .auth.getSession()
      .then(({ data }) => setHasSession(data.session !== null));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await getBrowserSupabase().auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(t("error"));
      return;
    }
    router.push("/corridor");
    router.refresh();
  };

  return (
    <main className="bg-plus-grid flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm border border-neutral-300 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold">{t("heading")}</h1>
        {hasSession === false ? (
          <div className="mt-3 text-sm text-neutral-600">
            <p>{t("expired")}</p>
            <Button size="md" className="mt-4" onClick={() => router.push("/")}>
              {t("backHome")}
            </Button>
          </div>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={submit}>
            <div>
              <label htmlFor={id} className="text-xs font-medium text-neutral-600">
                {t("newPassword")}
              </label>
              <input
                id={id}
                type="password"
                value={password}
                onChange={(e2) => setPassword(e2.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                className="mt-1 w-full border border-neutral-300 bg-white px-2.5 py-1.5 text-sm outline-none transition-colors duration-150 ease-out focus:border-brand focus:ring-2 focus:ring-brand/40"
              />
            </div>
            {error && (
              <p role="status" className="bg-red-500/10 px-2.5 py-1.5 text-xs text-red-800">
                {error}
              </p>
            )}
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={busy || hasSession === null}
            >
              {t("submit")}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
