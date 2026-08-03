"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/Button";

interface AdminUser {
  id: string;
  email: string | null;
  full_name: string;
  organisation: string;
  account_type: string;
  access_expires_at: string | null;
  is_admin: boolean;
  last_sign_in_at: string | null;
  created_at: string;
}

/**
 * Minimal admin console (user-management v1): list users, change account
 * type, extend/expire access, delete. Calls the admin API with the caller's
 * Bearer token; the server re-verifies is_admin on every request.
 */
export default function AdminClient() {
  const t = useTranslations("admin");
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);
  // Timestamp captured per refresh — Date.now() in render is impure under
  // the React compiler lint, and per-refresh freshness is all we need.
  const [nowTs, setNowTs] = useState(() => Date.now());

  const authedFetch = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      const { data } = await getBrowserSupabase().auth.getSession();
      const token = data.session?.access_token;
      return fetch(path, {
        ...init,
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(init.headers ?? {}),
        },
      });
    },
    [],
  );

  const refresh = useCallback(async () => {
    const res = await authedFetch("/api/v1/admin/users");
    if (!res.ok) {
      setError(t("loadError", { status: res.status }));
      setUsers([]);
      return;
    }
    setError(null);
    setUsers((await res.json()) as AdminUser[]);
    setNowTs(Date.now());
  }, [authedFetch, t]);

  // Deferred initial load (repo lint pattern): the compiler rejects state
  // updates reachable synchronously from an effect body.
  useEffect(() => {
    const tid = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(tid);
  }, [refresh]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id);
    const res = await authedFetch(`/api/v1/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    setBusyId(null);
    if (!res.ok) {
      setError(t("actionError", { status: res.status }));
      return;
    }
    await refresh();
  };

  const doDelete = async (u: AdminUser) => {
    setBusyId(u.id);
    const res = await authedFetch(`/api/v1/admin/users/${u.id}`, {
      method: "DELETE",
    });
    setBusyId(null);
    setConfirmDelete(null);
    if (!res.ok) {
      setError(t("actionError", { status: res.status }));
      return;
    }
    await refresh();
  };

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("en-GB") : "—";
  const expired = (u: AdminUser) =>
    u.access_expires_at !== null && new Date(u.access_expires_at).getTime() <= nowTs;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">{t("heading")}</h1>
        <Button size="md" onClick={() => void refresh()}>
          {t("refresh")}
        </Button>
      </div>
      <p className="mb-4 text-xs leading-snug text-neutral-500">{t("note")}</p>

      {error && (
        <p role="status" className="mb-3 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-800">
          {error}
        </p>
      )}

      {users === null ? (
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      ) : (
        <div className="overflow-x-auto border border-neutral-300 bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="px-3 py-2 font-medium" scope="col">{t("colUser")}</th>
                <th className="px-3 py-2 font-medium" scope="col">{t("colType")}</th>
                <th className="px-3 py-2 font-medium" scope="col">{t("colExpires")}</th>
                <th className="px-3 py-2 font-medium" scope="col">{t("colLastSignIn")}</th>
                <th className="px-3 py-2 font-medium" scope="col">{t("colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-neutral-200 align-top last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-medium text-neutral-900">{u.email ?? "—"}</div>
                    <div className="text-neutral-500">
                      {[u.full_name, u.organisation].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <label className="sr-only" htmlFor={`type-${u.id}`}>
                      {t("colType")}
                    </label>
                    <select
                      id={`type-${u.id}`}
                      value={u.account_type}
                      disabled={busyId === u.id}
                      onChange={(e) =>
                        void patch(u.id, { account_type: e.target.value })
                      }
                      className="border border-neutral-300 bg-white px-1.5 py-1"
                    >
                      <option value="full">{t("typeFull")}</option>
                      <option value="trial">{t("typeTrial")}</option>
                      <option value="teaching">{t("typeTeaching")}</option>
                    </select>
                    {u.is_admin && (
                      <span className="ml-1.5 bg-brand-tint px-1 py-px text-[10px] font-medium text-brand-deep">
                        {t("adminBadge")}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    <span className={expired(u) ? "font-medium text-red-700" : ""}>
                      {u.access_expires_at ? fmtDate(u.access_expires_at) : t("never")}
                      {expired(u) && ` · ${t("expiredBadge")}`}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{fmtDate(u.last_sign_in_at)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        disabled={busyId === u.id}
                        onClick={() => void patch(u.id, { extendDays: 30 })}
                      >
                        {t("extend30")}
                      </Button>
                      <Button
                        disabled={busyId === u.id}
                        onClick={() =>
                          void patch(u.id, {
                            access_expires_at: new Date(Date.now() - 1000).toISOString(),
                          })
                        }
                      >
                        {t("expireNow")}
                      </Button>
                      <Button
                        disabled={busyId === u.id}
                        onClick={() => setConfirmDelete(u)}
                        className="text-red-700"
                      >
                        {t("delete")}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("deleteConfirmTitle")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4"
        >
          <div className="w-full max-w-md border border-neutral-300 bg-white p-5 shadow-md">
            <h2 className="text-sm font-semibold">{t("deleteConfirmTitle")}</h2>
            <p className="mt-2 text-xs leading-snug text-neutral-600">
              {t("deleteConfirmBody", { email: confirmDelete.email ?? confirmDelete.id })}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={() => setConfirmDelete(null)}>{t("cancel")}</Button>
              <Button
                variant="primary"
                disabled={busyId === confirmDelete.id}
                onClick={() => void doDelete(confirmDelete)}
                className="bg-red-700 hover:bg-red-800"
              >
                {t("deleteConfirmAction")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
