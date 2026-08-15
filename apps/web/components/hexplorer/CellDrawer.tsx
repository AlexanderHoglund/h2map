"use client";

import { cellToLatLng } from "h3-js";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import {
  COST_YEARS,
  LAYER_KEYS,
  layerValue,
  type CostYear,
  type HexDatum,
  type LayerBasis,
  type LayerKey,
} from "./types";
import { isNonViable, NON_VIABLE_ABOVE } from "./scale";

interface Props {
  /** Last selected cell; kept by the parent while the drawer slides out. */
  datum: HexDatum | null;
  layerKey: LayerKey;
  basis: LayerBasis;
  costYear: CostYear;
  open: boolean;
  onClose: () => void;
  /** Open the split evaluate panel for this cell (Explorer workspace). */
  onEvaluate?: (lat: number, lon: number) => void;
  /**
   * Integrated corridor: "use as corridor fuel site" LAUNCHES the full
   * evaluation at this cell (via onEvaluate) — the tile value never enters
   * the corridor calculation; the evaluated cost structure is handed back
   * from the calculator panel instead.
   */
  corridorSitePicker?: boolean;
}

function fmt(value: number | null, digits: number): string {
  return value == null ? "—" : value.toFixed(digits);
}

function fmtPercent(value: number | null): string {
  return value == null ? "—" : `${(value * 100).toFixed(1)}%`;
}

/** Right-hand cell detail drawer; slides in on selection, Escape closes. */
export default function CellDrawer({
  datum,
  layerKey,
  basis,
  costYear,
  open,
  onClose,
  onEvaluate,
  corridorSitePicker,
}: Props) {
  const t = useTranslations("explorer");
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
    if (!shown || !onEvaluate) return;
    const [lat, lon] = cellToLatLng(shown.h3);
    onEvaluate(lat, lon);
    onClose(); // retract the quick popup as the split panel opens
  };

  /**
   * Hand this cell to the Green Corridor as the fuel-production site: the pick
   * travels via localStorage (the corridor model consumes and clears it on
   * load) — the corridor URL stays clean.
   */
  const useForCorridor = () => {
    if (!shown || !onEvaluate) return;
    // Evaluate-here is the ONLY site path: open the full LCOH evaluation at
    // this cell; the calculator's own "use as corridor fuel site" completes
    // the pick with the evaluated cost structure.
    const [lat, lon] = cellToLatLng(shown.h3);
    onEvaluate(lat, lon);
    onClose();
  };

  const lcohByLayer = shown
    ? {
        best: layerValue(shown.data, "best", costYear, basis),
        solar: layerValue(shown.data, "solar", costYear),
        wind: layerValue(shown.data, "wind", costYear),
      }
    : null;

  return (
    <aside
      role="dialog"
      aria-label={t("drawer.title")}
      aria-hidden={!open}
      inert={!open}
      className={`absolute inset-y-0 right-0 z-20 flex w-[360px] max-w-[85vw] flex-col border-l border-neutral-300 bg-white text-sm shadow-xl transition-transform duration-200 ease-out ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {shown && lcohByLayer && (
        <>
          <header className="flex items-center justify-between border-b border-neutral-300 px-4 py-3">
            <h2 className="font-medium">{t("drawer.title")}</h2>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label={t("drawer.close")}
              className="p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
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
              <h3 className="mb-1 text-xs font-medium text-neutral-500">
                {t("drawer.lcohHeading")} · {costYear} · {t("drawer.unit")}
              </h3>
              <dl>
                {LAYER_KEYS.map((key) => (
                  <div key={key} className="flex justify-between py-0.5">
                    <dt className="text-neutral-600">
                      {t(`drawer.layers.${key}`)}
                    </dt>
                    <dd
                      className={`tabular-nums font-medium ${
                        isNonViable(lcohByLayer[key]) ? "text-neutral-500" : ""
                      }`}
                    >
                      {fmt(lcohByLayer[key], 2)}
                    </dd>
                  </div>
                ))}
              </dl>
              {/* Past the ceiling the number is a verdict, not a price. */}
              {LAYER_KEYS.some((k) => isNonViable(lcohByLayer[k])) && (
                <p className="mt-1 text-[11px] leading-snug text-neutral-500">
                  {t("drawer.nonViableNote", { ceiling: NON_VIABLE_ABOVE })}
                </p>
              )}
            </section>

            <section>
              <h3 className="mb-1 text-xs font-medium text-neutral-500">
                {t("drawer.cfHeading")}
              </h3>
              <dl>
                <div className="flex justify-between py-0.5">
                  <dt className="text-neutral-600">
                    {t("drawer.solarCf")}
                  </dt>
                  <dd className="tabular-nums">{fmtPercent(shown.data.solarCf)}</dd>
                </div>
                <div className="flex justify-between py-0.5">
                  <dt className="text-neutral-600">
                    {t("drawer.windCf")}
                  </dt>
                  <dd className="tabular-nums">{fmtPercent(shown.data.windCf)}</dd>
                </div>
              </dl>
            </section>

            {/* Where this cell's numbers came from (T1/T2). Shown only
                when a recompute pass has recorded it. */}
            {(shown.data.pvDbTier || shown.data.windFidelity) && (
              <section>
                <h3 className="mb-1 text-xs font-medium text-neutral-500">
                  {t("drawer.sourceHeading")}
                </h3>
                <dl>
                  {shown.data.pvDbTier && (
                    <div className="flex justify-between py-0.5">
                      <dt className="text-neutral-600">{t("drawer.pvSource")}</dt>
                      <dd>{t(`drawer.pvTier.${shown.data.pvDbTier}`)}</dd>
                    </div>
                  )}
                  {shown.data.windFidelity && (
                    <div className="flex justify-between py-0.5">
                      <dt className="text-neutral-600">{t("drawer.windSource")}</dt>
                      <dd
                        className={
                          shown.data.windFidelity === "fallback"
                            ? "font-medium text-amber-800"
                            : undefined
                        }
                      >
                        {t(`drawer.windTier.${shown.data.windFidelity}`)}
                      </dd>
                    </div>
                  )}
                </dl>
                {shown.data.windFidelity === "fallback" && (
                  <p className="mt-1 text-[11px] leading-snug text-neutral-500">
                    {t("drawer.fallbackNote")}
                  </p>
                )}
              </section>
            )}

            <section>
              <h3 className="mb-1 text-xs font-medium text-neutral-500">
                {t("drawer.mixHeading")}
              </h3>
              <dl>
                <div className="flex justify-between py-0.5">
                  <dt className="text-neutral-600">
                    {t("drawer.pvMw")}
                  </dt>
                  <dd className="tabular-nums">
                    {fmt(shown.data.bestPvMw, 0)} {t("drawer.unitMw")}
                  </dd>
                </div>
                <div className="flex justify-between py-0.5">
                  <dt className="text-neutral-600">
                    {t("drawer.windMw")}
                  </dt>
                  <dd className="tabular-nums">
                    {fmt(shown.data.bestWindMw, 0)} {t("drawer.unitMw")}
                  </dd>
                </div>
                {/* Best-achievable sizing (the 45-configuration sweep):
                    how much renewable per unit of electrolyser this site
                    actually wants, and the mix that gets there. Null until
                    a recompute pass has run the sweep for this cell. */}
                {shown.data.optimal?.[String(costYear)] && (
                  <>
                    <div className="flex justify-between py-0.5">
                      <dt className="text-neutral-600">{t("drawer.optimalRatio")}</dt>
                      <dd className="tabular-nums">
                        {fmt(shown.data.optimal[String(costYear)]!.ratio, 2)}×
                      </dd>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <dt className="text-neutral-600">{t("drawer.optimalMix")}</dt>
                      <dd className="tabular-nums">
                        {fmtPercent(shown.data.optimal[String(costYear)]!.pvShare)}
                        {" "}
                        {t("drawer.pvShareSuffix")}
                      </dd>
                    </div>
                  </>
                )}
              </dl>
              {/* The seven cost components, utilization, curtailment and
                  stack replacements are per-EVALUATION outputs, not stored
                  per tile — the button below runs them for this cell. */}
              <p className="mt-1 text-[11px] leading-snug text-neutral-500">
                {t("drawer.diagnosticsNote")}
              </p>
            </section>

            <section>
              <h3 className="mb-1 text-xs font-medium text-neutral-500">
                {t("drawer.trendHeading")} · {t(`drawer.layers.${layerKey}`)}
              </h3>
              <dl>
                {COST_YEARS.map((year) => {
                  const v = layerValue(shown.data, layerKey, year, basis);
                  const active = year === costYear;
                  return (
                    <div
                      key={year}
                      className={`flex justify-between py-0.5 ${active ? "font-medium" : ""}`}
                    >
                      <dt
                        className={
                          active
                            ? "text-brand"
                            : "text-neutral-600"
                        }
                      >
                        {year}
                        {year !== 2024 ? " *" : ""}
                      </dt>
                      <dd className="tabular-nums">{fmt(v, 2)}</dd>
                    </div>
                  );
                })}
              </dl>
              <p className="mt-0.5 text-xs text-neutral-500">
                {t("drawer.trendNote")}
              </p>
            </section>

            <div className="space-y-0.5">
              <p className="font-mono text-xs text-neutral-500">
                {t("drawer.cellId", { id: shown.data.h3 })}
              </p>
              {shown.parentFill && (
                <p className="text-xs text-neutral-500">
                  {t("drawer.approximate")}
                </p>
              )}
            </div>
          </div>

          <footer className="space-y-2 border-t border-neutral-300 px-4 py-3">
            <button
              type="button"
              onClick={evaluateHere}
              className="w-full rounded-lg bg-brand px-3 py-2 font-medium text-white hover:bg-brand-strong focus:outline-none focus:ring-2 focus:ring-brand/40"
            >
              {t("drawer.evaluate")}
            </button>
            {corridorSitePicker && layerValue(shown.data, "best", 2024) !== null && (
              <button
                type="button"
                onClick={useForCorridor}
                className="w-full rounded-lg border border-emerald-600 px-3 py-2 font-medium text-emerald-700 hover:bg-emerald-500/10 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                {t("drawer.useForCorridor")}
              </button>
            )}
          </footer>
        </>
      )}
    </aside>
  );
}
