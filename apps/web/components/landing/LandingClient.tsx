"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/Button";

// The 2D shipping schematic used on the corridor entry screen — heavy and
// canvas-based, so client-only (ssr:false must live inside a client file).
const ShippingCanvas = dynamic(() => import("@/components/corridor/ShippingCanvas"), {
  ssr: false,
});

type Mode = "signin" | "request" | "forgot";
type Flash = { kind: "info" | "error"; text: string } | null;

/** Same-origin single-slash paths only — never trust ?next= further. */
function sanitizeNext(next: string | null): string | null {
  return next && /^\/(?!\/)/.test(next) ? next : null;
}

/**
 * The landing island: split hero (copy + auth card left, shipping chart
 * right — the corridor entry-screen pattern), with sign-in, request-access
 * (auto-granted account) and forgot-password flows on the browser Supabase
 * client. Signed-in visitors get an "enter platform" card instead.
 */
export default function LandingClient({
  initialEmail,
  isAdmin,
  nextPath,
  authError,
}: {
  initialEmail: string | null;
  isAdmin: boolean;
  nextPath: string | null;
  authError: string | null;
}) {
  const t = useTranslations("landing");
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Flash>(
    authError === "confirm" ? { kind: "error", text: "" } : null,
  );
  const signedIn = initialEmail !== null;
  const target = sanitizeNext(nextPath) ?? "/corridor";

  const run = async (fn: () => Promise<Flash>) => {
    setBusy(true);
    setFlash(null);
    try {
      setFlash(await fn());
    } finally {
      setBusy(false);
    }
  };

  const signIn = () =>
    run(async () => {
      const { error } = await getBrowserSupabase().auth.signInWithPassword({
        email,
        password,
      });
      if (error) return { kind: "error", text: t("errorSignIn") };
      router.push(target);
      router.refresh();
      return null;
    });

  const requestAccess = () =>
    run(async () => {
      const origin = window.location.origin;
      const { error } = await getBrowserSupabase().auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, organisation },
          emailRedirectTo: `${origin}/auth/confirm`,
        },
      });
      if (error) return { kind: "error", text: t("errorRequest") };
      return { kind: "info", text: t("requestSent") };
    });

  const forgot = () =>
    run(async () => {
      const origin = window.location.origin;
      const { error } = await getBrowserSupabase().auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/confirm?next=/reset-password`,
      });
      if (error) return { kind: "error", text: t("errorForgot") };
      return { kind: "info", text: t("forgotSent") };
    });

  const signOut = () =>
    run(async () => {
      await getBrowserSupabase().auth.signOut();
      router.refresh();
      return null;
    });

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:flex-row lg:overflow-hidden">
      {/* Left: brand, copy, auth card */}
      <div className="flex flex-1 items-center bg-page px-8 py-12 lg:overflow-y-auto lg:px-14">
        <div className="w-full max-w-xl">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
          <img
            src="/thaduberg-final-stripes-black-text.svg"
            alt="Thaduberg"
            className="mb-10 h-14 w-auto"
          />
          <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight lg:text-5xl">
            {t("heading")}
          </h1>
          <p className="mt-6 text-base leading-relaxed text-neutral-600">{t("body")}</p>

          <div className="mt-8 border border-neutral-300 bg-white p-5 shadow-sm">
            {signedIn ? (
              <div>
                <p className="text-sm text-neutral-600">
                  {t("signedInAs")}{" "}
                  <span className="font-medium text-neutral-900">{initialEmail}</span>
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => router.push(target)}
                  >
                    {t("enterPlatform")} →
                  </Button>
                  {isAdmin && (
                    <Button size="md" onClick={() => router.push("/admin")}>
                      {t("adminLink")}
                    </Button>
                  )}
                  <Button size="md" onClick={signOut} disabled={busy}>
                    {t("signOut")}
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                {/* Mode tabs */}
                <div
                  role="tablist"
                  aria-label={t("authTabsLabel")}
                  className="flex border-b border-neutral-300 text-sm"
                >
                  {(["signin", "request"] as const).map((m) => (
                    <button
                      key={m}
                      role="tab"
                      aria-selected={mode === m}
                      onClick={() => {
                        setMode(m);
                        setFlash(null);
                      }}
                      className={`px-4 py-2 font-medium transition-colors ${
                        mode === m
                          ? "border-b-2 border-brand text-brand-deep"
                          : "text-neutral-500 hover:text-neutral-800"
                      }`}
                    >
                      {m === "signin" ? t("tabSignIn") : t("tabRequest")}
                    </button>
                  ))}
                </div>

                <form
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (mode === "signin") void signIn();
                    else if (mode === "request") void requestAccess();
                    else void forgot();
                  }}
                >
                  {mode === "request" && (
                    <>
                      <Field
                        label={t("fieldName")}
                        type="text"
                        value={fullName}
                        onChange={setFullName}
                        autoComplete="name"
                        required
                      />
                      <Field
                        label={t("fieldOrganisation")}
                        type="text"
                        value={organisation}
                        onChange={setOrganisation}
                        autoComplete="organization"
                        required
                      />
                    </>
                  )}
                  <Field
                    label={t("fieldEmail")}
                    type="email"
                    value={email}
                    onChange={setEmail}
                    autoComplete="email"
                    required
                  />
                  {mode !== "forgot" && (
                    <Field
                      label={t("fieldPassword")}
                      type="password"
                      value={password}
                      onChange={setPassword}
                      autoComplete={
                        mode === "signin" ? "current-password" : "new-password"
                      }
                      minLength={8}
                      required
                    />
                  )}

                  {(flash || authError === "confirm") && (
                    <p
                      role="status"
                      className={`px-2.5 py-1.5 text-xs leading-snug ${
                        (flash?.kind ?? "error") === "error"
                          ? "bg-red-500/10 text-red-800"
                          : "bg-emerald-500/10 text-emerald-800"
                      }`}
                    >
                      {flash?.text || t("errorConfirmLink")}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <Button type="submit" variant="primary" size="md" disabled={busy}>
                      {mode === "signin"
                        ? t("submitSignIn")
                        : mode === "request"
                          ? t("submitRequest")
                          : t("submitForgot")}
                    </Button>
                    {mode === "signin" && (
                      <button
                        type="button"
                        onClick={() => {
                          setMode("forgot");
                          setFlash(null);
                        }}
                        className="text-xs text-brand underline underline-offset-2 decoration-brand/30 hover:decoration-brand"
                      >
                        {t("forgotLink")}
                      </button>
                    )}
                    {mode === "forgot" && (
                      <button
                        type="button"
                        onClick={() => {
                          setMode("signin");
                          setFlash(null);
                        }}
                        className="text-xs text-brand underline underline-offset-2 decoration-brand/30 hover:decoration-brand"
                      >
                        {t("backToSignIn")}
                      </button>
                    )}
                  </div>
                  {mode === "request" && (
                    <p className="text-[11px] leading-snug text-neutral-500">
                      {t("requestNote")}
                    </p>
                  )}
                </form>
              </div>
            )}
          </div>

          <p className="mt-6 text-xs text-neutral-500">{t("footnote")}</p>
        </div>
      </div>

      {/* Right: the drafting-grid panel with the 2D shipping chart */}
      <div className="bg-plus-grid relative hidden overflow-hidden border-l border-neutral-300 lg:block lg:w-1/2">
        <ShippingCanvas />
      </div>
    </div>
  );
}

/** Labeled input matching the ui/TextInput control styling (adds type). */
function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
  required,
  minLength,
}: {
  label: string;
  type: "text" | "email" | "password";
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-neutral-600">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        className="mt-1 w-full border border-neutral-300 bg-white px-2.5 py-1.5 text-sm outline-none transition-colors duration-150 ease-out placeholder:text-neutral-500 focus:border-brand focus:ring-2 focus:ring-brand/40"
      />
    </div>
  );
}
