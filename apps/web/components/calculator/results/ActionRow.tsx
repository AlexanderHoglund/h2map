"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { SimulateResponse } from "../types";

const CSV_COLUMNS = [
  "year",
  "h2Kg",
  "waterM3",
  "eConsumedKwh",
  "ePvKwh",
  "eWindKwh",
  "eGridKwh",
  "curtailedPvKwh",
  "curtailedWindKwh",
  "efficiencyLhv",
  "operatingHours",
  "stackReplacement",
] as const;

function download(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Share / export actions under the results. */
export default function ActionRow({
  response,
  onCopyLink,
}: {
  response: SimulateResponse;
  onCopyLink: () => void;
}) {
  const t = useTranslations("calculator");
  const [copied, setCopied] = useState(false);

  const copy = () => {
    onCopyLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const exportCsv = () => {
    const rows = response.results.annual.map((row) =>
      CSV_COLUMNS.map((c) => String(row[c])).join(","),
    );
    download(
      "h2map-annual.csv",
      "text/csv;charset=utf-8",
      [CSV_COLUMNS.join(","), ...rows].join("\n"),
    );
  };

  const exportJson = () => {
    download(
      "h2map-results.json",
      "application/json",
      JSON.stringify(response, null, 2),
    );
  };

  const secondary =
    "rounded-md border border-neutral-300 px-3 py-1.5 text-sm transition-colors duration-150 ease-out hover:border-blue-600 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:border-neutral-700";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={copy} className={secondary}>
        {copied ? t("run.copied") : t("results.actions.copyLink")}
      </button>
      <button type="button" onClick={exportCsv} className={secondary}>
        {t("results.actions.exportCsv")}
      </button>
      <button type="button" onClick={exportJson} className={secondary}>
        {t("results.actions.exportJson")}
      </button>
      <button
        type="button"
        disabled
        title={t("results.actions.saveSoon")}
        className="cursor-not-allowed rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-400 dark:border-neutral-800 dark:text-neutral-600"
      >
        {t("results.actions.save")}
      </button>
      <button
        type="button"
        disabled
        title={t("results.actions.compareSoon")}
        className="cursor-not-allowed rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-400 dark:border-neutral-800 dark:text-neutral-600"
      >
        {t("results.actions.compare")}
      </button>
    </div>
  );
}
