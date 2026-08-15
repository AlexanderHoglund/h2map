"use client";

import { useTranslations } from "next-intl";
import { domainLabels, lcohGradientCss, RAMP_STOPS, stopPosition } from "./scale";
import type { LayerBasis, LayerKey } from "./types";

interface Props {
  layerKey: LayerKey;
  basis: LayerBasis;
  maxDetail: boolean;
}

/** Always-visible legend (bottom-left): the ramp over 3.5–10 USD/kg. */
export default function Legend({ layerKey, basis, maxDetail }: Props) {
  const t = useTranslations("explorer");
  // The basis (WACC / best-achievable) only re-expresses the "best" layer.
  const financing =
    layerKey === "best" && basis !== "default"
      ? t(`controls.bases.${basis}`)
      : t("legend.financing");
  const labels = domainLabels(layerKey);
  return (
    <div className="pointer-events-none absolute bottom-8 left-4 z-10 w-72 rounded-lg border border-neutral-300 bg-white/95 px-3 py-2 text-xs shadow-md backdrop-blur">
      <div
        className="h-2.5 w-full rounded-sm"
        style={{ background: lcohGradientCss() }}
        role="img"
        aria-label={t("legend.caption")}
      />
      {/* Ticks sit at their value's position under the gradient (the stop
          values are not evenly spaced), ends anchored to the bar's edges. */}
      <div className="relative mt-1 h-3.5 text-[10px] tabular-nums text-neutral-600">
        {labels.map((label, i) => {
          const pct = stopPosition(RAMP_STOPS[i]![0]) * 100;
          const style =
            i === 0
              ? { left: 0 }
              : i === labels.length - 1
                ? { right: 0 }
                : { left: `${pct}%`, transform: "translateX(-50%)" };
          return (
            <span key={label} className="absolute top-0" style={style}>
              {label}
            </span>
          );
        })}
      </div>
      <p className="mt-0.5 text-neutral-500">
        {t("legend.caption")} ·{" "}
        <span className="font-medium text-neutral-700">
          {t(`controls.layers.${layerKey}`)}
        </span>
      </p>
      <p className="mt-1 text-[11px] text-neutral-500">
        {financing}
      </p>
      {(layerKey === "wind" || layerKey === "best") && (
        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-neutral-500">
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-3.5 shrink-0 rounded-[2px] border-2 border-neutral-800 bg-neutral-200"
          />
          {t("legend.fidelity")}
        </p>
      )}
      {maxDetail && (
        <p className="mt-1 text-neutral-500">
          {t("legend.maxDetail")}
        </p>
      )}
    </div>
  );
}
