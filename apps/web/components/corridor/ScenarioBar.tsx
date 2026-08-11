"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import type { CorridorModel } from "./state";
import type { ProjectsApi } from "./useProjects";

/**
 * The workspace scenario bar: the quick actions for the project you are
 * editing — save, duplicate, share, and the local JSON round-trip.
 *
 * Project MANAGEMENT (the list, open, rename, delete, revoke) lives on tab
 * 00 "Projects"; this bar deliberately keeps only what you reach for while
 * mid-edit. Both surfaces share one state (useProjects), so a save here
 * shows up there immediately and vice versa.
 */
export default function ScenarioBar({
  model,
  projects,
}: {
  model: CorridorModel;
  projects: ProjectsApi;
}) {
  const t = useTranslations("corridor.scenarioBar");

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(model.scenario, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${projects.name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "corridor"}.json`;
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
        projects.setName(file.name.replace(/\.json$/i, ""));
        projects.flash(t("imported"));
      } catch {
        projects.flash(t("importFailed"));
      }
    };
    input.click();
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs">
      {/* The project identity leads the bar on every working tab — compact,
          no navbar real estate. */}
      <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        {t("projectEyebrow")}
      </span>
      <input
        value={projects.name}
        onChange={(e) => projects.setName(e.target.value)}
        aria-label={t("name")}
        className="w-56 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs outline-none focus:border-brand focus:ring-2 focus:ring-brand/40"
      />
      {!projects.currentId && (
        <span className="bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
          {t("unsaved")}
        </span>
      )}
      <Button
        onClick={() => void projects.save()}
        disabled={projects.busy || !projects.session}
      >
        {t("save")}
      </Button>
      <Button
        onClick={() => void projects.save({ duplicate: true })}
        disabled={projects.busy || !projects.session}
      >
        {t("duplicate")}
      </Button>
      <Button
        onClick={() => void projects.share()}
        disabled={projects.busy || !projects.session}
      >
        {t("share")}
      </Button>
      <Button onClick={exportJson}>{t("export")}</Button>
      <Button onClick={importJson}>{t("import")}</Button>
      <Button
        onClick={() => {
          if (!window.confirm(t("resetConfirm"))) return;
          projects.startNew();
        }}
      >
        {t("reset")}
      </Button>
      <span className="flex-1" />
      {projects.notice && <span className="text-emerald-800">{projects.notice}</span>}
      <span className="text-neutral-500">{t("draftNote")}</span>
    </div>
  );
}
