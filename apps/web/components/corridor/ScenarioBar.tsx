"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { Session } from "@supabase/supabase-js";
import {
  migrateScenarioInput,
  resolveScenario,
  type ScenarioInput,
} from "@h2map/corridor-schema";
import { CORRIDOR_ENGINE_VERSION, evaluateScenario } from "@h2map/corridor-engine";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { DEFAULT_BUNDLE, type CorridorModel } from "./state";

/**
 * Scenario management (build-plan 3.5): save / duplicate / share (read-only
 * link) / export JSON / field-level diff, plus the minimal Supabase email
 * sign-in the non-goals allow. Writes go through the API (server-side
 * validation + version pinning); this bar only holds the session and the
 * user's scenario list.
 */

interface ScenarioRow {
  id: string;
  name: string;
  share_token: string | null;
  updated_at: string;
}

export default function ScenarioBar({ model }: { model: CorridorModel }) {
  const t = useTranslations("corridor.scenarioBar");
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMsg, setAuthMsg] = useState<string | null>(null);
  const [name, setName] = useState("My corridor");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [list, setList] = useState<ScenarioRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffRows, setDiffRows] = useState<{ path: string; a: string; b: string }[] | null>(null);
  const [diffGap, setDiffGap] = useState<{ a: number; b: number } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  const authedFetch = useCallback(
    (path: string, init: RequestInit = {}) =>
      fetch(path, {
        ...init,
        headers: {
          "content-type": "application/json",
          ...(session ? { authorization: `Bearer ${session.access_token}` } : {}),
          ...(init.headers ?? {}),
        },
      }),
    [session],
  );

  const refreshList = useCallback(async () => {
    if (!session) return;
    const res = await authedFetch("/api/v1/corridor/scenarios");
    if (res.ok) {
      const body = (await res.json()) as { scenarios: ScenarioRow[] };
      setList(body.scenarios);
    }
  }, [authedFetch, session]);

  useEffect(() => {
    // Deferred so the effect never sets state synchronously (lint rule).
    const id = setTimeout(() => void refreshList(), 0);
    return () => clearTimeout(id);
  }, [refreshList]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  };

  const save = async (duplicate = false) => {
    if (!session) {
      setAuthOpen(true);
      return;
    }
    setBusy(true);
    try {
      const asNew = duplicate || !currentId;
      const res = await authedFetch(
        asNew ? "/api/v1/corridor/scenarios" : `/api/v1/corridor/scenarios/${currentId}`,
        {
          method: asNew ? "POST" : "PUT",
          body: JSON.stringify(
            asNew
              ? { name: duplicate ? `${name} (copy)` : name, payload: model.scenario }
              : { name, payload: model.scenario },
          ),
        },
      );
      if (!res.ok) throw new Error((await res.text()).slice(0, 200));
      const row = (await res.json()) as { id: string; name: string };
      setCurrentId(row.id);
      if (duplicate) setName(row.name);
      window.history.replaceState(null, "", `/corridor?s=${row.id}`);
      await refreshList();
      flash(t("saved"));
    } catch (err) {
      flash(`${t("saveFailed")}: ${String(err).slice(0, 120)}`);
    } finally {
      setBusy(false);
    }
  };

  const loadScenario = async (id: string) => {
    setBusy(true);
    try {
      const res = await authedFetch(`/api/v1/corridor/scenarios/${id}`);
      if (!res.ok) throw new Error(String(res.status));
      const row = (await res.json()) as {
        id: string;
        name: string;
        inputs: unknown;
        engine_version: string | null;
        schema_version: number | null;
      };
      const migrated = migrateScenarioInput(row.inputs);
      model.load(migrated.input);
      setCurrentId(row.id);
      setName(row.name);
      window.history.replaceState(null, "", `/corridor?s=${row.id}`);
      // 4.2 disclosure: the corridor tool always evaluates live, so loading
      // under a newer engine/schema is announced, never silent.
      if (migrated.migratedFrom !== null) {
        flash(t("loadedMigrated", { from: migrated.migratedFrom }));
      } else if (row.engine_version && row.engine_version !== CORRIDOR_ENGINE_VERSION) {
        flash(t("loadedNewerEngine", { saved: row.engine_version }));
      } else {
        flash(t("loaded"));
      }
    } catch {
      flash(t("loadFailed"));
    } finally {
      setBusy(false);
    }
  };

  // URL carries the scenario id (build-plan 3.1): auto-load ?s= once signed in.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("s");
    if (!id || !session || currentId) return;
    const timer = setTimeout(() => void loadScenario(id), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const share = async () => {
    if (!currentId) {
      flash(t("saveFirst"));
      return;
    }
    const res = await authedFetch(`/api/v1/corridor/scenarios/${currentId}`, {
      method: "PUT",
      body: JSON.stringify({ share: true }),
    });
    if (res.ok) {
      const row = (await res.json()) as { share_token: string };
      const url = `${window.location.origin}/corridor/s/${row.share_token}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      flash(t("shareCopied"));
      await refreshList();
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(model.scenario, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "corridor"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /** Field-level diff (3.5): current draft vs a saved scenario + gap deltas. */
  const diffAgainst = async (id: string) => {
    const res = await authedFetch(`/api/v1/corridor/scenarios/${id}`);
    if (!res.ok) return;
    const row = (await res.json()) as { inputs: unknown };
    const other = migrateScenarioInput(row.inputs).input;
    const rows: { path: string; a: string; b: string }[] = [];
    walkDiff(model.scenario, other, "", rows);
    setDiffRows(rows);
    try {
      const gapA = evaluateScenario(resolveScenario(model.scenario, DEFAULT_BUNDLE)).summary
        .gapPvUsdM;
      const gapB = evaluateScenario(resolveScenario(other, DEFAULT_BUNDLE)).summary.gapPvUsdM;
      setDiffGap({ a: gapA, b: gapB });
    } catch {
      setDiffGap(null);
    }
    setDiffOpen(true);
  };

  const signIn = async (mode: "in" | "up") => {
    setAuthMsg(null);
    const fn =
      mode === "in"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });
    const { error } = await fn;
    if (error) setAuthMsg(error.message);
    else if (mode === "up") setAuthMsg(t("checkEmail"));
    else setAuthOpen(false);
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-xs dark:border-neutral-800">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label={t("name")}
        className="w-40 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
      />
      <Btn onClick={() => save(false)} disabled={busy}>
        {t("save")}
      </Btn>
      <Btn onClick={() => save(true)} disabled={busy || !session}>
        {t("duplicate")}
      </Btn>
      <Btn onClick={share} disabled={busy || !session}>
        {t("share")}
      </Btn>
      <Btn onClick={exportJson}>{t("export")}</Btn>
      {session && list.length > 0 && (
        <>
          <select
            aria-label={t("open")}
            value=""
            onChange={(e) => e.target.value && void loadScenario(e.target.value)}
            className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="">{t("open")}</option>
            {list.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            aria-label={t("diff")}
            value=""
            onChange={(e) => e.target.value && void diffAgainst(e.target.value)}
            className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="">{t("diff")}</option>
            {list.map((r) => (
              <option key={r.id} value={r.id}>
                vs {r.name}
              </option>
            ))}
          </select>
        </>
      )}
      <span className="flex-1" />
      {notice && <span className="text-emerald-600 dark:text-emerald-500">{notice}</span>}
      {session ? (
        <button
          type="button"
          onClick={() => void supabase.auth.signOut()}
          className="text-neutral-500 hover:underline"
        >
          {t("signOut")} ({session.user.email})
        </button>
      ) : (
        <Btn onClick={() => setAuthOpen(true)}>{t("signIn")}</Btn>
      )}

      {/* Auth modal */}
      {authOpen && !session && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded-lg border border-neutral-200 bg-white p-4 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
            <h3 className="text-sm font-semibold">{t("signIn")}</h3>
            <input
              type="email"
              placeholder="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-3 w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
            />
            <input
              type="password"
              placeholder="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
            />
            {authMsg && <p className="mt-2 text-[11px] text-amber-600">{authMsg}</p>}
            <div className="mt-3 flex items-center gap-2">
              <Btn onClick={() => void signIn("in")}>{t("signIn")}</Btn>
              <Btn onClick={() => void signIn("up")}>{t("signUp")}</Btn>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => setAuthOpen(false)}
                className="text-xs text-neutral-500 hover:underline"
              >
                {t("close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diff modal */}
      {diffOpen && diffRows && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[70vh] w-full max-w-lg overflow-auto rounded-lg border border-neutral-200 bg-white p-4 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
            <h3 className="text-sm font-semibold">{t("diffTitle")}</h3>
            {diffGap && (
              <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                {t("diffGap", {
                  a: diffGap.a.toFixed(2),
                  b: diffGap.b.toFixed(2),
                  delta: (diffGap.a - diffGap.b).toFixed(2),
                })}
              </p>
            )}
            {diffRows.length === 0 ? (
              <p className="mt-3 text-xs text-neutral-500">{t("diffNone")}</p>
            ) : (
              <table className="mt-3 w-full text-[11px] tabular-nums">
                <thead>
                  <tr className="text-left text-neutral-500">
                    <th className="py-1 pr-2 font-medium">{t("diffField")}</th>
                    <th className="py-1 pr-2 font-medium">{t("diffCurrent")}</th>
                    <th className="py-1 font-medium">{t("diffOther")}</th>
                  </tr>
                </thead>
                <tbody>
                  {diffRows.map((r) => (
                    <tr key={r.path} className="border-t border-neutral-100 dark:border-neutral-800">
                      <td className="py-1 pr-2 font-mono">{r.path}</td>
                      <td className="py-1 pr-2">{r.a}</td>
                      <td className="py-1">{r.b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="mt-3 text-right">
              <button
                type="button"
                onClick={() => setDiffOpen(false)}
                className="text-xs text-neutral-500 hover:underline"
              >
                {t("close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Btn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
    >
      {children}
    </button>
  );
}

/** Leaf-level JSON diff: paths where the two scenarios differ. */
function walkDiff(
  a: unknown,
  b: unknown,
  path: string,
  out: { path: string; a: string; b: string }[],
): void {
  if (out.length >= 200) return; // sanity cap
  if (
    a !== null &&
    b !== null &&
    typeof a === "object" &&
    typeof b === "object" &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    for (const k of keys) {
      walkDiff(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
        path ? `${path}.${k}` : k,
        out,
      );
    }
    return;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    out.push({ path, a: shortVal(a), b: shortVal(b) });
  }
}

function shortVal(v: unknown): string {
  const s = v === undefined ? "—" : JSON.stringify(v);
  return s.length > 40 ? `${s.slice(0, 37)}…` : s;
}

export type { ScenarioInput };
