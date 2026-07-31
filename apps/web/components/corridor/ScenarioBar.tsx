"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { CorridorModel } from "./state";

/**
 * Scenario bar — local-only, no accounts. The draft autosaves to
 * localStorage; here you can name it, export it as JSON, import a
 * previously exported file, or reset to the workbook defaults.
 *
 * (Account save / share links / scenario diff were removed with the
 * sign-in UI — the Phase-2 API routes remain server-side for when auth
 * becomes real.)
 */
export default function ScenarioBar({ model }: { model: CorridorModel }) {
  const t = useTranslations("corridor.scenarioBar");
  const [name, setName] = useState("My corridor");
  const [notice, setNotice] = useState<string | null>(null);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
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

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-xs">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label={t("name")}
        className="w-40 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs"
      />
      <Btn onClick={exportJson}>{t("export")}</Btn>
      <Btn onClick={importJson}>{t("import")}</Btn>
      <Btn
        onClick={() => {
          if (!window.confirm(t("resetConfirm"))) return;
          model.reset();
          setName("My corridor");
          flash(t("resetDone"));
        }}
      >
        {t("reset")}
      </Btn>
      <span className="flex-1" />
      {notice && <span className="text-emerald-600">{notice}</span>}
      <span className="text-neutral-500">{t("draftNote")}</span>
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
      className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium hover:bg-neutral-100 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
