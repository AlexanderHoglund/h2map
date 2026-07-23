"use client";

import { cellToLatLng } from "h3-js";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { LAYER_KEYS, type HexDatum } from "./types";

interface Props {
  /** Last selected cell; kept by the parent while the drawer slides out. */
  datum: HexDatum | null;
  open: boolean;
  onClose: () => void;
}

function fmt(value: number | null, digits: number): string {
  return value == null ? "—" : value.toFixed(digits);
}

function fmtPercent(value: number | null): string {
  return value == null ? "—" : `${(value * 100).toFixed(1)}%`;
}

/** Right-hand cell detail drawer; slides in on selection, Escape closes. */
export default function CellDrawer({ datum, open, onClose }: Props) {
  const t = useTranslations("explorer");
  const router = useRouter();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const shown = datum;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Move focus into the drawer when it opens (no trap — deferred).
  useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [open]);

  const evaluateHere = () => {
    if (!shown) return;
    const [lat, lon] = cellToLatLng(shown.h3);
    router.push(`/calculator?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`);
  };

  const lcohByLayer = shown
    ? {
        best: shown.data.lcohBest,
        solar: shown.data.lcohSolar,
        wind: shown.data.lcohWind,
      }
    : null;

  return (
    <aside
      role="dialog"
      aria-label={t("drawer.title")}
      aria-hidden={!open}
      inert={!open}
      className={`absolute inset-y-0 right-0 z-20 flex w-[360px] max-w-[85vw] flex-col border-l border-neutral-200 bg-white text-sm transition-transform duration-200 ease-out dark:border-neutral-800 dark:bg-neutral-900 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {shown && lcohByLayer && (
        <>
          <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <h2 className="font-medium">{t("drawer.title")}</h2>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label={t("drawer.close")}
              className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <section>
              <h3 className="mb-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                {t("drawer.lcohHeading")} · {t("drawer.unit")}
              </h3>
              <dl>
                {LAYER_KEYS.map((key) => (
                  <div key={key} className="flex justify-between py-0.5">
                    <dt className="text-neutral-600 dark:text-neutral-300">
                      {t(`drawer.layers.${key}`)}
                    </dt>
                    <dd className="tabular-nums font-medium">
                      {fmt(lcohByLayer[key], 2)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section>
              <h3 className="mb-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                {t("drawer.cfHeading")}
              </h3>
              <dl>
                <div className="flex justify-between py-0.5">
                  <dt className="text-neutral-600 dark:text-neutral-300">
                    {t("drawer.solarCf")}
                  </dt>
                  <dd className="tabular-nums">{fmtPercent(shown.data.solarCf)}</dd>
                </div>
                <div className="flex justify-between py-0.5">
                  <dt className="text-neutral-600 dark:text-neutral-300">
                    {t("drawer.windCf")}
                  </dt>
                  <dd className="tabular-nums">{fmtPercent(shown.data.windCf)}</dd>
                </div>
              </dl>
            </section>

            <section>
              <h3 className="mb-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                {t("drawer.mixHeading")}
              </h3>
              <dl>
                <div className="flex justify-between py-0.5">
                  <dt className="text-neutral-600 dark:text-neutral-300">
                    {t("drawer.pvMw")}
                  </dt>
                  <dd className="tabular-nums">
                    {fmt(shown.data.bestPvMw, 0)} {t("drawer.unitMw")}
                  </dd>
                </div>
                <div className="flex justify-between py-0.5">
                  <dt className="text-neutral-600 dark:text-neutral-300">
                    {t("drawer.windMw")}
                  </dt>
                  <dd className="tabular-nums">
                    {fmt(shown.data.bestWindMw, 0)} {t("drawer.unitMw")}
                  </dd>
                </div>
              </dl>
            </section>

            <section>
              <h3 className="mb-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                {t("drawer.trendHeading")}
              </h3>
              <div className="flex justify-between py-0.5">
                <span className="text-neutral-600 dark:text-neutral-300">
                  {t("drawer.trendCurrent")}
                </span>
                <span className="tabular-nums font-medium">
                  {shown.value.toFixed(2)}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                {t("drawer.trendPending")}
              </p>
            </section>

            <div className="space-y-0.5">
              <p className="font-mono text-xs text-neutral-400 dark:text-neutral-500">
                {t("drawer.cellId", { id: shown.data.h3 })}
              </p>
              {shown.parentFill && (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {t("drawer.approximate")}
                </p>
              )}
            </div>
          </div>

          <footer className="border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <button
              type="button"
              onClick={evaluateHere}
              className="w-full rounded-lg bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              {t("drawer.evaluate")}
            </button>
          </footer>
        </>
      )}
    </aside>
  );
}
