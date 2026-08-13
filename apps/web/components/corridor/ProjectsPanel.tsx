"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CORRIDOR_ENGINE_VERSION } from "@h2map/corridor-engine";
import { Button } from "@/components/ui/Button";
import type { ProjectsApi, ProjectRow, ProjectViewMode } from "./useProjects";

/**
 * Tab 00 — Projects: the home of saved work. Everything scenario management
 * needed but had to be dug out of a modal: see all projects, open one,
 * rename in place, duplicate, share/revoke a read-only link, delete, or
 * start a new project from the reference defaults.
 *
 * The current project is marked, so it is always obvious what the five
 * input tabs are editing.
 */
export default function ProjectsPanel({
  projects,
  onOpen,
}: {
  projects: ProjectsApi;
  /** Called after a project loads (the workspace jumps to the Intro step). */
  onOpen: () => void;
}) {
  const t = useTranslations("corridor.projects");
  const tv = useTranslations("corridor.viewMode");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMode, setNewMode] = useState<ProjectViewMode>("simplified");

  /** One draft slot: switching projects overwrites it. Ask first. */
  const confirmDiscard = () =>
    !projects.isDirty() || window.confirm(t("discardConfirm", { name: projects.name }));

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const stale = (p: ProjectRow) =>
    p.engine_version !== null && p.engine_version !== CORRIDOR_ENGINE_VERSION;

  const openProject = async (id: string) => {
    if (!confirmDiscard()) return;
    await projects.load(id);
    onOpen();
  };

  const create = async () => {
    if (!confirmDiscard()) return;
    const ok = await projects.createProject({
      name: newName.trim() || t("newProjectDefaultName"),
      viewMode: newMode,
    });
    if (ok) {
      setCreating(false);
      setNewName("");
      onOpen();
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("heading")}</h2>
          <p className="mt-1 text-xs leading-snug text-neutral-600">{t("intro")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="md"
            disabled={projects.busy}
            onClick={() => void projects.save()}
          >
            {projects.currentId ? t("saveCurrent") : t("saveDraft")}
          </Button>
          <Button
            size="md"
            disabled={projects.busy || !projects.session}
            onClick={() => setCreating((v) => !v)}
          >
            {t("newProject")}
          </Button>
        </div>
      </div>

      {/* New project: name + the LEVEL it starts at (Simplified can be
          upgraded to Standard later — one-way; Standard is permanent). */}
      {creating && (
        <div className="mb-4 border border-brand/40 bg-brand-tint/30 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-600">
            {t("newProject")}
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-neutral-700">
              {t("nameLabel")}
              <input
                value={newName}
                autoFocus
                placeholder={t("newProjectDefaultName")}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void create();
                  if (e.key === "Escape") setCreating(false);
                }}
                className="min-w-64 border border-neutral-300 bg-white px-2.5 py-1.5 text-sm font-normal outline-none focus:border-brand focus:ring-2 focus:ring-brand/40"
              />
            </label>
            <fieldset className="flex items-center gap-3">
              <legend className="mb-1 text-xs font-medium text-neutral-700">
                {t("newProjectMode")}
              </legend>
              {(["simplified", "standard"] as const).map((m) => (
                <label key={m} className="flex items-center gap-1.5 text-xs">
                  <input
                    type="radio"
                    name="new-project-mode"
                    checked={newMode === m}
                    onChange={() => setNewMode(m)}
                  />
                  {tv(m)}
                </label>
              ))}
            </fieldset>
            <Button
              variant="primary"
              size="md"
              disabled={projects.busy}
              onClick={() => void create()}
            >
              {t("createProject")}
            </Button>
            <Button size="md" onClick={() => setCreating(false)}>
              {t("cancel")}
            </Button>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-neutral-600">
            {t("newProjectNote")}
          </p>
        </div>
      )}

      {/* The project the input tabs are editing right now */}
      <div className="mb-4 border border-neutral-300 bg-white p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
          {t("currentLabel")}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="current-project-name">
            {t("nameLabel")}
          </label>
          <input
            id="current-project-name"
            value={projects.name}
            onChange={(e) => projects.setName(e.target.value)}
            className="min-w-64 flex-1 border border-neutral-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/40"
          />
          {projects.currentId ? (
            <span className="bg-brand-tint px-1.5 py-0.5 text-[11px] font-medium text-brand-deep">
              {t("savedBadge")}
            </span>
          ) : (
            <span className="bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
              {t("unsavedBadge")}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-neutral-500">
          {projects.currentId ? t("currentSavedNote") : t("currentDraftNote")}
        </p>
        <div className="mt-2">
          <Button variant="primary" size="md" onClick={onOpen}>
            {t("continueEditing")} →
          </Button>
        </div>
      </div>

      {projects.notice && (
        <p role="status" className="mb-3 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-800">
          {projects.notice}
        </p>
      )}

      {projects.loading ? (
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      ) : projects.list.length === 0 ? (
        <div className="border border-dashed border-neutral-300 bg-white p-8 text-center">
          <p className="text-sm font-medium text-neutral-700">{t("emptyTitle")}</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-snug text-neutral-500">
            {t("emptyBody")}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-neutral-300 bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="px-3 py-2 font-medium" scope="col">
                  {t("colName")}
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  {t("colUpdated")}
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  {t("colSharing")}
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  {t("colActions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {projects.list.map((p) => {
                const isCurrent = p.id === projects.currentId;
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-neutral-200 align-top last:border-0 ${
                      isCurrent ? "bg-brand-tint/40" : ""
                    }`}
                  >
                    <td className="px-3 py-2">
                      {renamingId === p.id ? (
                        <span className="flex flex-wrap items-center gap-1.5">
                          <label className="sr-only" htmlFor={`rename-${p.id}`}>
                            {t("nameLabel")}
                          </label>
                          <input
                            id={`rename-${p.id}`}
                            value={renameValue}
                            autoFocus
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                void projects.rename(p.id, renameValue);
                                setRenamingId(null);
                              }
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                            className="border border-neutral-300 bg-white px-2 py-1 text-xs outline-none focus:border-brand focus:ring-2 focus:ring-brand/40"
                          />
                          <Button
                            onClick={() => {
                              void projects.rename(p.id, renameValue);
                              setRenamingId(null);
                            }}
                          >
                            {t("renameSave")}
                          </Button>
                          <Button onClick={() => setRenamingId(null)}>{t("cancel")}</Button>
                        </span>
                      ) : (
                        <span>
                          <span className="font-medium text-neutral-900">{p.name}</span>
                          {p.view_mode && (
                            <span className="ml-1.5 bg-neutral-500/10 px-1 py-px text-[10px] font-medium uppercase tracking-wide text-neutral-600">
                              {tv(p.view_mode)}
                            </span>
                          )}
                          {isCurrent && (
                            <span className="ml-1.5 text-[10px] font-medium text-brand-deep">
                              {t("currentBadge")}
                            </span>
                          )}
                          {stale(p) && (
                            <span
                              className="ml-1.5 bg-amber-500/10 px-1 py-px text-[10px] font-medium text-amber-800"
                              title={t("staleTitle", {
                                saved: p.engine_version ?? "?",
                                current: CORRIDOR_ENGINE_VERSION,
                              })}
                            >
                              {t("staleBadge")}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums text-neutral-600">
                      {fmtDate(p.updated_at)}
                    </td>
                    <td className="px-3 py-2">
                      {p.share_token ? (
                        <span className="bg-brand-tint px-1 py-px text-[10px] font-medium text-brand-deep">
                          {t("sharedBadge")}
                        </span>
                      ) : (
                        <span className="text-neutral-400">{t("private")}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {confirmDeleteId === p.id ? (
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-red-800">{t("deleteConfirm")}</span>
                          <Button
                            disabled={projects.busy}
                            className="text-red-700"
                            onClick={() => {
                              void projects.remove(p.id);
                              setConfirmDeleteId(null);
                            }}
                          >
                            {t("deleteYes")}
                          </Button>
                          <Button onClick={() => setConfirmDeleteId(null)}>
                            {t("cancel")}
                          </Button>
                        </span>
                      ) : (
                        <span className="flex flex-wrap gap-1.5">
                          <Button
                            disabled={projects.busy}
                            onClick={() => void openProject(p.id)}
                          >
                            {t("open")}
                          </Button>
                          <Button
                            disabled={projects.busy}
                            onClick={() => {
                              setRenamingId(p.id);
                              setRenameValue(p.name);
                            }}
                          >
                            {t("rename")}
                          </Button>
                          {p.share_token ? (
                            <>
                              <Button
                                onClick={() => {
                                  const url = `${window.location.origin}/corridor/s/${p.share_token}`;
                                  void navigator.clipboard
                                    .writeText(url)
                                    .then(() => projects.flash(t("linkCopied")));
                                }}
                              >
                                {t("copyLink")}
                              </Button>
                              <Button onClick={() => void projects.revoke(p.id)}>
                                {t("revoke")}
                              </Button>
                            </>
                          ) : (
                            <Button onClick={() => void projects.share(p.id)}>
                              {t("share")}
                            </Button>
                          )}
                          <Button
                            className="text-red-700"
                            onClick={() => setConfirmDeleteId(p.id)}
                          >
                            {t("delete")}
                          </Button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-snug text-neutral-500">{t("footnote")}</p>
    </div>
  );
}
