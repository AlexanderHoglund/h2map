"use client";

import { useTranslations } from "next-intl";
import { domainLabels, lcohGradientCss } from "./scale";
import type { LayerBasis, LayerKey } from "./types";

interface Props {
  layerKey: LayerKey;
  basis: LayerBasis;
  maxDetail: boolean;
}

/** Always-visible legend (bottom-left): benefit ramp over the layer's domain. */
export default function Legend({ layerKey, basis, maxDetail }: Props) {
  const t = useTranslations("explorer");
  // The basis (WACC / best-achievable) only re-expresses the "best" layer.
  const financing =
    layerKey === "best" && basis !== "default"
      ? t(`controls.bases.${basis}`)
      : t("legend.financing");
  const [lo, mid, hi] = domainLabels(layerKey);
  return (
    <div className="pointer-events-none absolute bottom-8 left-4 z-10 w-52 rounded-lg border border-neutral-200 bg-white/95 px-3 py-2 text-xs shadow-md backdrop-blur">
      <div
        className="h-2.5 w-full rounded-sm"
        style={{ background: lcohGradientCss() }}
        role="img"
        aria-label={t("legend.caption")}
      />
      <div className="mt-1 flex justify-between tabular-nums text-neutral-600">
        <span>{lo}</span>
        <span>{mid}</span>
        <span>{hi}</span>
      </div>
      <p className="mt-0.5 text-neutral-500">
        {t("legend.caption")} ·{" "}
        <span className="font-medium text-neutral-700">
          {t(`controls.layers.${layerKey}`)}
        </span>
      </p>
      <p className="mt-1 text-[11px] text-neutral-400">
        {financing}
      </p>
      {maxDetail && (
        <p className="mt-1 text-neutral-500">
          {t("legend.maxDetail")}
        </p>
      )}
    </div>
  );
}
