"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { COST_YEARS, LAYER_KEYS, type CostYear, type LayerKey } from "./types";

interface Props {
  layerKey: LayerKey;
  onLayerChange: (layer: LayerKey) => void;
  costYear: CostYear;
  onCostYearChange: (year: CostYear) => void;
  opacity: number;
  onOpacityChange: (value: number) => void;
  visible: boolean;
  onVisibleChange: (value: boolean) => void;
}

/** Collapsible layer-controls card (top-left). */
export default function LayerControls({
  layerKey,
  onLayerChange,
  costYear,
  onCostYearChange,
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
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
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
            <div className="inline-flex overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
              {COST_YEARS.map((year) => {
                const active = year === costYear;
                return (
                  <button
                    key={year}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onCostYearChange(year)}
                    className={`px-2.5 py-1.5 text-xs tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/50 ${
                      active
                        ? "bg-blue-600 text-white"
                        : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    }`}
                  >
                    {year}
                  </button>
                );
              })}
            </div>
            {costYear !== 2024 && (
              <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                {t("controls.costYearProjected")}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor={opacityId}
              className="mb-1 flex justify-between text-xs font-medium text-neutral-500 dark:text-neutral-400"
            >
              <span>{t("controls.opacity")}</span>
              <span className="tabular-nums">
                {t("controls.opacityValue", { value: opacity })}
              </span>
            </label>
            <input
              id={opacityId}
              type="range"
              min={0}
              max={100}
              value={opacity}
              onChange={(e) => onOpacityChange(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:bg-neutral-700 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-blue-600"
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
