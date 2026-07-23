"use client";

import { useTranslations } from "next-intl";
import { lcohGradientCss } from "./scale";
import type { LayerKey } from "./types";

interface Props {
  layerKey: LayerKey;
  maxDetail: boolean;
}

/** Always-visible legend (bottom-left): fixed 2–8 USD/kg benefit ramp. */
export default function Legend({ layerKey, maxDetail }: Props) {
  const t = useTranslations("explorer");
  return (
    <div className="pointer-events-none absolute bottom-8 left-4 z-10 w-52 rounded-lg border border-neutral-200 bg-white/95 px-3 py-2 text-xs backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95">
      <div
        className="h-2.5 w-full rounded-sm"
        style={{ background: lcohGradientCss() }}
        role="img"
        aria-label={t("legend.caption")}
      />
      <div className="mt-1 flex justify-between tabular-nums text-neutral-600 dark:text-neutral-300">
        <span>{t("legend.min")}</span>
        <span>{t("legend.mid")}</span>
        <span>{t("legend.max")}</span>
      </div>
      <p className="mt-0.5 text-neutral-500 dark:text-neutral-400">
        {t("legend.caption")} ·{" "}
        <span className="font-medium text-neutral-700 dark:text-neutral-300">
          {t(`controls.layers.${layerKey}`)}
        </span>
      </p>
      {maxDetail && (
        <p className="mt-1 text-neutral-500 dark:text-neutral-400">
          {t("legend.maxDetail")}
        </p>
      )}
    </div>
  );
}
