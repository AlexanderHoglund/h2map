"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Session } from "@supabase/supabase-js";
import { migrateScenarioInput } from "@h2map/corridor-schema";
import { CORRIDOR_ENGINE_VERSION } from "@h2map/corridor-engine";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { defaultScenario, emptyScenario } from "@/lib/corridor/scenarioDefaults";
import type { CorridorModel } from "./state";

/**
 * Shared project (saved-scenario) state for the corridor workspace.
 *
 * Lifted out of ScenarioBar so the Projects tab and the scenario bar act on
 * ONE source of truth: the same list, the same "which project am I in"
 * pointer, the same save/load/delete calls. Writes go through the API
 * (server-side validation + version pinning); the localStorage draft keeps
 * autosaving underneath, so an unsaved draft is never lost by navigating.
 */

export type ProjectViewMode = "simplified" | "standard";

export interface ProjectRow {
  id: string;
  name: string;
  share_token: string | null;
  created_at: string;
  updated_at: string;
  engine_version: string | null;
  ref_bundle_version: string | null;
  /** Per-project Simplified/Standard state; null = legacy row (browser pref). */
  view_mode?: ProjectViewMode | null;
}

export interface ProjectsApi {
  session: Session | null;
  list: ProjectRow[];
  loading: boolean;
  busy: boolean;
  /** The project the workspace is currently editing (null = unsaved draft). */
  currentId: string | null;
  name: string;
  setName: (n: string) => void;
  notice: string | null;
  flash: (msg: string) => void;
  refresh: () => Promise<void>;
  save: (opts?: { duplicate?: boolean }) => Promise<void>;
  load: (id: string) => Promise<void>;
  rename: (id: string, next: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  share: (id?: string) => Promise<void>;
  revoke: (id: string) => Promise<void>;
  /** Clear the workspace to the reference defaults as a NEW unsaved project. */
  startNew: () => void;
  /** Create a real project row (empty starter payload) with a chosen mode. */
  createProject: (opts: { name: string; viewMode: ProjectViewMode }) => Promise<boolean>;
  /** Persist a mode flip on the current project (fire-and-forget). */
  setProjectViewMode: (mode: ProjectViewMode) => void;
  /** Unsaved work in the draft slot (vs the loaded row / the app default). */
  isDirty: () => boolean;
}

export interface UseProjectsOptions {
  /** Current view mode, for stamping new/duplicated rows. */
  getViewMode?: () => ProjectViewMode;
  /** Apply a loaded project's stored mode (null = keep the browser pref). */
  onViewMode?: (mode: ProjectViewMode | null) => void;
}

export const DEFAULT_PROJECT_NAME = "Mejillones–Japan copper corridor";

/** Canonical JSON for dirty-comparison: migration-normalized key order. */
function normalizeScenarioJson(scenario: unknown): string {
  return JSON.stringify(
    migrateScenarioInput(JSON.parse(JSON.stringify(scenario))).input,
  );
}

export function useProjects(
  model: CorridorModel,
  opts: UseProjectsOptions = {},
): ProjectsApi {
  const t = useTranslations("corridor.scenarioBar");
  const { getViewMode, onViewMode } = opts;
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [list, setList] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [name, setName] = useState(DEFAULT_PROJECT_NAME);
  const [notice, setNotice] = useState<string | null>(null);
  // The last saved/loaded scenario JSON — the app default until a project is
  // opened. isDirty compares the live draft against it, so the unsaved-
  // changes guard also catches a draft carried over from a previous session.
  // BOTH sides are normalized through the migration registry: the model
  // normalizes on load but not on fresh init, and zod re-orders keys — a
  // raw-vs-normalized comparison would read as spuriously dirty.
  const savedSnapshotRef = useRef<string>(normalizeScenarioJson(defaultScenario()));
  const seedRequestedRef = useRef(false);

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

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  }, []);

  /** Expired accounts get a typed 403 — route them to the lockout screen. */
  const guardExpired = (res: Response): boolean => {
    if (res.status === 403) {
      window.location.assign("/expired");
      return true;
    }
    return false;
  };

  const refresh = useCallback(async () => {
    if (!session) return;
    // Starter seeding: once per user, EVER (server-enforced; cheap 204 after
    // the first time). Requested once per page load, before the first list.
    if (!seedRequestedRef.current) {
      seedRequestedRef.current = true;
      await authedFetch("/api/v1/corridor/scenarios/seed", { method: "POST" }).catch(
        () => {},
      );
    }
    const res = await authedFetch("/api/v1/corridor/scenarios");
    if (res.ok) {
      const body = (await res.json()) as { scenarios: ProjectRow[] };
      setList(body.scenarios);
    }
    setLoading(false);
  }, [authedFetch, session]);

  useEffect(() => {
    // Deferred so the effect never sets state synchronously (lint rule).
    const id = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(id);
  }, [refresh]);

  const save = useCallback(
    async ({ duplicate = false }: { duplicate?: boolean } = {}) => {
      if (!session) return;
      setBusy(true);
      try {
        const asNew = duplicate || !currentId;
        const res = await authedFetch(
          asNew
            ? "/api/v1/corridor/scenarios"
            : `/api/v1/corridor/scenarios/${currentId}`,
          {
            method: asNew ? "POST" : "PUT",
            body: JSON.stringify({
              name: duplicate ? `${name} (copy)` : name,
              payload: model.scenario,
              ...(getViewMode ? { view_mode: getViewMode() } : {}),
            }),
          },
        );
        if (guardExpired(res)) return;
        if (!res.ok) throw new Error((await res.text()).slice(0, 200));
        const row = (await res.json()) as { id: string; name: string };
        savedSnapshotRef.current = normalizeScenarioJson(model.scenario);
        setCurrentId(row.id);
        if (duplicate) setName(row.name);
        window.history.replaceState(null, "", `/corridor?s=${row.id}`);
        await refresh();
        flash(t("saved"));
      } catch (err) {
        flash(`${t("saveFailed")}: ${String(err).slice(0, 120)}`);
      } finally {
        setBusy(false);
      }
    },
    [authedFetch, currentId, flash, model, name, refresh, session, t],
  );

  const load = useCallback(
    async (id: string) => {
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
          view_mode?: ProjectViewMode | null;
        };
        const migrated = migrateScenarioInput(row.inputs);
        model.load(migrated.input);
        savedSnapshotRef.current = normalizeScenarioJson(migrated.input);
        onViewMode?.(row.view_mode ?? null);
        setCurrentId(row.id);
        setName(row.name);
        window.history.replaceState(null, "", `/corridor?s=${row.id}`);
        // Disclosure: loading under a newer engine/schema is announced,
        // never silent — the corridor always evaluates live.
        if (migrated.migratedFrom !== null) {
          flash(t("loadedMigrated", { from: migrated.migratedFrom }));
        } else if (
          row.engine_version &&
          row.engine_version !== CORRIDOR_ENGINE_VERSION
        ) {
          flash(t("loadedNewerEngine", { saved: row.engine_version }));
        } else {
          flash(t("loaded"));
        }
      } catch {
        flash(t("loadFailed"));
      } finally {
        setBusy(false);
      }
    },
    [authedFetch, flash, model, onViewMode, t],
  );

  // The URL carries the project id: auto-load ?s= once the session is known.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("s");
    if (!id || !session || currentId) return;
    const timer = setTimeout(() => void load(id), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const rename = useCallback(
    async (id: string, next: string) => {
      const trimmed = next.trim();
      if (!trimmed) return;
      setBusy(true);
      try {
        const res = await authedFetch(`/api/v1/corridor/scenarios/${id}`, {
          method: "PUT",
          body: JSON.stringify({ name: trimmed }),
        });
        if (guardExpired(res)) return;
        if (!res.ok) throw new Error(String(res.status));
        if (currentId === id) setName(trimmed);
        await refresh();
        flash(t("renamed"));
      } catch {
        flash(t("saveFailed"));
      } finally {
        setBusy(false);
      }
    },
    [authedFetch, currentId, flash, refresh, t],
  );

  const remove = useCallback(
    async (id: string) => {
      setBusy(true);
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
        await refresh();
        flash(t("deleted"));
      } catch {
        flash(t("deleteFailed"));
      } finally {
        setBusy(false);
      }
    },
    [authedFetch, currentId, flash, refresh, t],
  );

  const share = useCallback(
    async (id?: string) => {
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
        await refresh();
      }
    },
    [authedFetch, currentId, flash, refresh, t],
  );

  const revoke = useCallback(
    async (id: string) => {
      const res = await authedFetch(`/api/v1/corridor/scenarios/${id}`, {
        method: "PUT",
        body: JSON.stringify({ share: false }),
      });
      if (guardExpired(res)) return;
      if (res.ok) {
        flash(t("revoked"));
        await refresh();
      }
    },
    [authedFetch, flash, refresh, t],
  );

  const startNew = useCallback(() => {
    model.reset();
    savedSnapshotRef.current = normalizeScenarioJson(defaultScenario());
    setCurrentId(null);
    setName(DEFAULT_PROJECT_NAME);
    window.history.replaceState(null, "", "/corridor");
    flash(t("newStarted"));
  }, [flash, model, t]);

  const createProject = useCallback(
    async ({ name: newName, viewMode }: { name: string; viewMode: ProjectViewMode }) => {
      if (!session) return false;
      setBusy(true);
      try {
        const payload = emptyScenario();
        const res = await authedFetch("/api/v1/corridor/scenarios", {
          method: "POST",
          body: JSON.stringify({ name: newName, payload, view_mode: viewMode }),
        });
        if (guardExpired(res)) return false;
        if (!res.ok) throw new Error((await res.text()).slice(0, 200));
        const row = (await res.json()) as { id: string; name: string };
        model.load(payload);
        savedSnapshotRef.current = normalizeScenarioJson(payload);
        // The new project opens in the mode chosen at creation.
        onViewMode?.(viewMode);
        setCurrentId(row.id);
        setName(row.name);
        window.history.replaceState(null, "", `/corridor?s=${row.id}`);
        await refresh();
        flash(t("saved"));
        return true;
      } catch (err) {
        flash(`${t("saveFailed")}: ${String(err).slice(0, 120)}`);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [authedFetch, flash, model, onViewMode, refresh, session, t],
  );

  const setProjectViewMode = useCallback(
    (mode: ProjectViewMode) => {
      if (!currentId || !session) return;
      // Fire-and-forget: a mode flip is a cheap column write (no results
      // recompute server-side); failures only cost mode persistence.
      void authedFetch(`/api/v1/corridor/scenarios/${currentId}`, {
        method: "PUT",
        body: JSON.stringify({ view_mode: mode }),
      }).catch(() => {});
    },
    [authedFetch, currentId, session],
  );

  const isDirty = useCallback(
    () => normalizeScenarioJson(model.scenario) !== savedSnapshotRef.current,
    [model.scenario],
  );

  return {
    session,
    list,
    loading,
    busy,
    currentId,
    name,
    setName,
    notice,
    flash,
    refresh,
    save,
    load,
    rename,
    remove,
    share,
    revoke,
    startNew,
    createProject,
    setProjectViewMode,
    isDirty,
  };
}
