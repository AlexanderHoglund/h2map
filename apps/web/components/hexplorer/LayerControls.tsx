"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { LAYER_KEYS, type LayerKey } from "./types";

const COST_YEARS = ["2024", "2030", "2040", "2050"] as const;
const ACTIVE_COST_YEAR = "2024";

interface Props {
  layerKey: LayerKey;
  onLayerChange: (layer: LayerKey) => void;
  opacity: number;
  onOpacityChange: (value: number) => void;
  visible: boolean;
  onVisibleChange: (value: boolean) => void;
}

/** Collapsible layer-controls card (top-left). */
export default function LayerControls({
  layerKey,
  onLayerChange,
  opacity,
  onOpacityChange,
  visible,
  onVisibleChange,
}: Props) {
  const t = useTranslations("explorer");
  const [open, setOpen] = useState(true);
  const opacityId = useId();
  const visibleId = useId();
  const bodyId = useId();

  return (
    <section className="rounded-lg border border-neutral-200 bg-white/95 text-sm backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={open ? t("controls.collapse") : t("controls.expand")}
        className="flex w-full items-center justify-between px-3 py-2 font-medium"
      >
        <span>{t("controls.title")}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={`h-3.5 w-3.5 text-neutral-500 transition-transform ${open ? "" : "-rotate-90"}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M3.5 6l4.5 4.5L12.5 6" />
        </svg>
      </button>

      {open && (
        <div
          id={bodyId}
          className="space-y-3 border-t border-neutral-200 px-3 py-3 dark:border-neutral-800"
        >
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {t("controls.layerGroup")}
            </legend>
            <div className="space-y-1">
              {LAYER_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="explorer-layer"
                    value={key}
                    checked={layerKey === key}
                    onChange={() => onLayerChange(key)}
                    className="accent-blue-600"
                  />
                  <span>{t(`controls.layers.${key}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <p className="mb-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {t("controls.costYear")}
            </p>
            <div className="inline-flex overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-700">
              {COST_YEARS.map((year) => {
                const active = year === ACTIVE_COST_YEAR;
                return (
                  <button
                    key={year}
                    type="button"
                    disabled={!active}
                    aria-pressed={active}
                    title={active ? undefined : t("controls.costYearSoon")}
                    className={`px-2 py-1 text-xs tabular-nums ${
                      active
                        ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                        : "cursor-not-allowed text-neutral-400 dark:text-neutral-600"
                    }`}
                  >
                    {year}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label
              htmlFor={opacityId}
              className="mb-1 flex justify-between text-xs font-medium text-neutral-500 dark:text-neutral-400"
            >
              <span>{t("controls.opacity")}</span>
              <span className="tabular-nums">{opacity}</span>
            </label>
            <input
              id={opacityId}
              type="range"
              min={0}
              max={100}
              value={opacity}
              onChange={(e) => onOpacityChange(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
          </div>

          <label htmlFor={visibleId} className="flex items-center gap-2">
            <input
              id={visibleId}
              type="checkbox"
              checked={visible}
              onChange={(e) => onVisibleChange(e.target.checked)}
              className="accent-blue-600"
            />
            <span>{t("controls.visible")}</span>
          </label>
        </div>
      )}
    </section>
  );
}
