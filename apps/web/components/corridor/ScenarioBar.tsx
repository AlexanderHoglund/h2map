"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { Session } from "@supabase/supabase-js";
import {
  migrateScenarioInput,
  resolveScenario,
} from "@h2map/corridor-schema";
import { CORRIDOR_ENGINE_VERSION, evaluateScenario } from "@h2map/corridor-engine";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/Button";
import { DEFAULT_BUNDLE, type CorridorModel } from "./state";

/**
 * Scenario management (restored with the login build): account save /
 * duplicate / share (read-only link) / open / field-level diff / a Manage
 * modal with delete + link revocation — plus the local Export/Import JSON
 * and reset. Writes go through the API (server-side validation + version
 * pinning); the localStorage draft keeps autosaving underneath, so the
 * entry screen's "Resume draft" flow is unchanged.
 *
 * No sign-in UI here: the corridor is auth-gated, so a session exists.
 * Account buttons are defensively disabled during the brief initial
 * session read. Expired accounts get 403 access_expired from the API and
 * are routed to /expired.
 */

interface ScenarioRow {
  id: string;
  name: string;
  share_token: string | null;
  updated_at: string;
}

const DEFAULT_NAME = "Mejillones–Japan copper corridor";

export default function ScenarioBar({ model }: { model: CorridorModel }) {
  const t = useTranslations("corridor.scenarioBar");
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [name, setName] = useState(DEFAULT_NAME);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [list, setList] = useState<ScenarioRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffRows, setDiffRows] = useState<
    { path: string; a: string; b: string }[] | null
  >(null);
  const [diffGap, setDiffGap] = useState<{ a: number; b: number } | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
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

  /** Expired accounts get a typed 403 — route them to the lockout screen. */
  const guardExpired = (res: Response): boolean => {
    if (res.status === 403) {
      window.location.assign("/expired");
      return true;
    }
    return false;
  };

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
    if (!session) return;
    setBusy(true);
    try {
      const asNew = duplicate || !currentId;
      const res = await authedFetch(
        asNew ? "/api/v1/corridor/scenarios" : `/api/v1/corridor/scenarios/${currentId}`,
        {
          method: asNew ? "POST" : "PUT",
          body: JSON.stringify({
            name: duplicate ? `${name} (copy)` : name,
            payload: model.scenario,
          }),
        },
      );
      if (guardExpired(res)) return;
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
      if (guardExpired(res)) return;
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
      // Disclosure (4.2): loading under a newer engine/schema is announced,
      // never silent — the corridor always evaluates live.
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

  // URL carries the scenario id: auto-load ?s= once the session is known.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("s");
    if (!id || !session || currentId) return;
    const timer = setTimeout(() => void loadScenario(id), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const share = async (id?: string) => {
    const target = id ?? currentId;
    if (!target) {
      flash(t("saveFirst"));
      return;
    }
    const res = await authedFetch(`/api/v1/corridor/scenarios/${target}`, {
      method: "PUT",
      body: JSON.stringify({ share: true }),
    });
    if (guardExpired(res)) return;
    if (res.ok) {
      const row = (await res.json()) as { share_token: string };
      const url = `${window.location.origin}/corridor/s/${row.share_token}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      flash(t("shareCopied"));
      await refreshList();
    }
  };

  const revoke = async (id: string) => {
    const res = await authedFetch(`/api/v1/corridor/scenarios/${id}`, {
      method: "PUT",
      body: JSON.stringify({ share: false }),
    });
    if (guardExpired(res)) return;
    if (res.ok) {
      flash(t("revoked"));
      await refreshList();
    }
  };

  const deleteScenario = async (id: string) => {
    setBusy(true);
    setConfirmDeleteId(null);
    try {
      const res = await authedFetch(`/api/v1/corridor/scenarios/${id}`, {
        method: "DELETE",
      });
      if (guardExpired(res)) return;
      if (!res.ok) throw new Error(String(res.status));
      if (currentId === id) {
        setCurrentId(null);
        window.history.replaceState(null, "", "/corridor");
      }
      await refreshList();
      flash(t("deleted"));
    } catch {
      flash(t("deleteFailed"));
    } finally {
      setBusy(false);
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

  const importJson = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        model.load(JSON.parse(await file.text()));
        setName(file.name.replace(/\.json$/i, ""));
        flash(t("imported"));
      } catch {
        flash(t("importFailed"));
      }
    };
    input.click();
  };

  /** Field-level diff: current draft vs a saved scenario + gap deltas. */
  const diffAgainst = async (id: string) => {
    const res = await authedFetch(`/api/v1/corridor/scenarios/${id}`);
    if (guardExpired(res)) return;
    if (!res.ok) return;
    const row = (await res.json()) as { inputs: unknown };
    const other = migrateScenarioInput(row.inputs).input;
    const rows: { path: string; a: string; b: string }[] = [];
    walkDiff(model.scenario, other, "", rows);
    setDiffRows(rows);
    try {
      const gapA = evaluateScenario(resolveScenario(model.scenario, DEFAULT_BUNDLE))
        .summary.gapPvUsdM;
      const gapB = evaluateScenario(resolveScenario(other, DEFAULT_BUNDLE)).summary
        .gapPvUsdM;
      setDiffGap({ a: gapA, b: gapB });
    } catch {
      setDiffGap(null);
    }
    setDiffOpen(true);
  };

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB");

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label={t("name")}
        className="w-40 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs outline-none focus:border-brand focus:ring-2 focus:ring-brand/40"
      />
      <Button onClick={() => void save(false)} disabled={busy || !session}>
        {t("save")}
      </Button>
      <Button onClick={() => void save(true)} disabled={busy || !session}>
        {t("duplicate")}
      </Button>
      <Button onClick={() => void share()} disabled={busy || !session}>
        {t("share")}
      </Button>
      {session && list.length > 0 && (
        <>
          <label className="sr-only" htmlFor="scn-open">
            {t("open")}
          </label>
          <select
            id="scn-open"
            value=""
            onChange={(e) => e.target.value && void loadScenario(e.target.value)}
            className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs"
          >
            <option value="">{t("open")}</option>
            {list.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <Button onClick={() => setManageOpen(true)}>{t("manage")}</Button>
        </>
      )}
      <Button onClick={exportJson}>{t("export")}</Button>
      <Button onClick={importJson}>{t("import")}</Button>
      <Button
        onClick={() => {
          if (!window.confirm(t("resetConfirm"))) return;
          model.reset();
          setCurrentId(null);
          setName(DEFAULT_NAME);
          window.history.replaceState(null, "", "/corridor");
          flash(t("resetDone"));
        }}
      >
        {t("reset")}
      </Button>
      <span className="flex-1" />
      {notice && <span className="text-emerald-600">{notice}</span>}
      <span className="text-neutral-500">{t("draftNote")}</span>

      {/* Manage modal: the my-scenarios list (load / share / revoke / delete) */}
      {manageOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("manageTitle")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4"
        >
          <div className="max-h-[70vh] w-full max-w-lg overflow-auto border border-neutral-300 bg-white p-4 shadow-md">
            <h3 className="text-sm font-semibold">{t("manageTitle")}</h3>
            {list.length === 0 ? (
              <p className="mt-3 text-xs text-neutral-500">{t("manageEmpty")}</p>
            ) : (
              <table className="mt-3 w-full text-xs">
                <thead>
                  <tr className="border-b border-neutral-300 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                    <th className="py-1.5 pr-2 font-medium" scope="col">
                      {t("name")}
                    </th>
                    <th className="py-1.5 pr-2 font-medium" scope="col">
                      {t("manageUpdated")}
                    </th>
                    <th className="py-1.5 font-medium" scope="col">
                      {t("manageActions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id} className="border-b border-neutral-100 align-top last:border-0">
                      <td className="py-1.5 pr-2">
                        <span className="font-medium">{r.name}</span>
                        {r.share_token && (
                          <span className="ml-1.5 bg-brand-tint px-1 py-px text-[10px] font-medium text-brand-deep">
                            {t("sharedBadge")}
                          </span>
                        )}
                        {r.id === currentId && (
                          <span className="ml-1.5 text-[10px] text-neutral-500">
                            {t("currentBadge")}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 tabular-nums text-neutral-600">
                        {fmtDate(r.updated_at)}
                      </td>
                      <td className="py-1.5">
                        {confirmDeleteId === r.id ? (
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-red-800">{t("deleteConfirm")}</span>
                            <Button onClick={() => void deleteScenario(r.id)} className="text-red-700">
                              {t("deleteYes")}
                            </Button>
                            <Button onClick={() => setConfirmDeleteId(null)}>
                              {t("cancel")}
                            </Button>
                          </span>
                        ) : (
                          <span className="flex flex-wrap gap-1.5">
                            <Button
                              disabled={busy}
                              onClick={() => {
                                setManageOpen(false);
                                void loadScenario(r.id);
                              }}
                            >
                              {t("load")}
                            </Button>
                            {r.share_token ? (
                              <>
                                <Button
                                  onClick={() => {
                                    const url = `${window.location.origin}/corridor/s/${r.share_token}`;
                                    void navigator.clipboard
                                      .writeText(url)
                                      .then(() => flash(t("shareCopied")));
                                  }}
                                >
                                  {t("copyLink")}
                                </Button>
                                <Button onClick={() => void revoke(r.id)}>
                                  {t("revoke")}
                                </Button>
                              </>
                            ) : (
                              <Button onClick={() => void share(r.id)}>{t("share")}</Button>
                            )}
                            <Button
                              onClick={() => setConfirmDeleteId(r.id)}
                              className="text-red-700"
                            >
                              {t("delete")}
                            </Button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="mt-3 flex items-center justify-between gap-3">
              {session && list.length > 0 && (
                <label className="flex items-center gap-1.5 text-[11px] text-neutral-600">
                  {t("diff")}
                  <select
                    value=""
                    onChange={(e) => e.target.value && void diffAgainst(e.target.value)}
                    className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs"
                  >
                    <option value="">{t("diffPick")}</option>
                    {list.map((r) => (
                      <option key={r.id} value={r.id}>
                        vs {r.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                onClick={() => {
                  setManageOpen(false);
                  setConfirmDeleteId(null);
                }}
                className="ml-auto text-xs text-neutral-500 hover:underline"
              >
                {t("close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diff modal */}
      {diffOpen && diffRows && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("diffTitle")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4"
        >
          <div className="max-h-[70vh] w-full max-w-lg overflow-auto border border-neutral-300 bg-white p-4 shadow-md">
            <h3 className="text-sm font-semibold">{t("diffTitle")}</h3>
            {diffGap && (
              <p className="mt-1 text-xs text-neutral-600">
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
                    <th className="py-1 pr-2 font-medium" scope="col">
                      {t("diffField")}
                    </th>
                    <th className="py-1 pr-2 font-medium" scope="col">
                      {t("diffCurrent")}
                    </th>
                    <th className="py-1 font-medium" scope="col">
                      {t("diffOther")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {diffRows.map((r) => (
                    <tr key={r.path} className="border-t border-neutral-100">
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
