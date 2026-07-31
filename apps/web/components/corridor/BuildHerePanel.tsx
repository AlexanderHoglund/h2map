"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getSynthesisBenchmark } from "@h2map/corridor-schema";
import { synthesize } from "@h2map/corridor-engine";
import { formatCameraHash } from "@/lib/url-state";
import { layerValue } from "@/components/hexplorer/types";
import type { SitePick } from "@/components/hexplorer/HexplorerMap";
import type { CorridorModel } from "./state";

/**
 * "Build here" (build-plan 3.3): the H2MAP map — the SAME component the
 * Explorer uses, embedded with a narrowed job — picks the cell where the
 * hydrogen gets made. The cell's LCOH is the map's own seeded value (same
 * engine, same T1.1 gates, same provenance the Explorer shows; masked cells
 * carry no value and cannot be picked). Delivered price = LCOH → carrier
 * synthesis (plant annuitized at the PRODUCTION-side WACC, divergence D7) →
 * logistics to the bunker port. The lineage chip deep-links back to the
 * Explorer at the picked cell.
 */

const HexplorerMap = dynamic(() => import("@/components/hexplorer/HexplorerMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-xs text-neutral-500">…</div>
  ),
});

const ROUTE_FACTOR = 1.3;

export default function BuildHerePanel({
  model,
  side,
}: {
  model: CorridorModel;
  side: "green" | "fossil";
}) {
  const t = useTranslations("corridor.buildHere");
  const { scenario, update } = model;
  const s = scenario[side];
  const [pickerOpen, setPickerOpen] = useState(!s.buildHere);
  const [config, setConfig] = useState({
    productionWacc: 0.08,
    electricityUsdPerMwh: 60,
    co2UsdPerTonne: 30,
    distanceKm: s.buildHere?.distanceKm ?? 300,
  });
  const [pickError, setPickError] = useState<string | null>(null);

  let benchmark: ReturnType<typeof getSynthesisBenchmark> | null = null;
  try {
    benchmark = getSynthesisBenchmark(s.fuelId);
  } catch {
    benchmark = null;
  }

  if (!benchmark) {
    return (
      <p className="sm:col-span-2 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-700 dark:text-amber-500">
        {t("unsupportedCarrier", { fuel: s.fuelId })}
      </p>
    );
  }
  const carrier = benchmark;

  const applySite = (pick: { h3: string; lat: number; lon: number; lcoh: number }) => {
    const synth = synthesize(pick.lcoh, carrier, config);
    const logistics = config.distanceKm * ROUTE_FACTOR * carrier.shippingUsdPerTonneKm;
    const delivered = Math.round((synth.gateUsdPerTonne + logistics) * 100) / 100;
    update((d) => {
      d[side].deliveredPriceUsdPerTonne = delivered;
      d[side].buildHere = {
        h3: pick.h3,
        lat: pick.lat,
        lon: pick.lon,
        lcohUsdPerKg: pick.lcoh,
        carrierId: carrier.carrierId,
        synthesisGateUsdPerTonne: Math.round(synth.gateUsdPerTonne * 100) / 100,
        distanceKm: config.distanceKm,
        logisticsUsdPerTonne: Math.round(logistics * 100) / 100,
      };
    });
  };

  const onSitePicked = (pick: SitePick) => {
    // Masked / failed-gate cells carry no best value — not selectable (3.3).
    const lcoh = layerValue(pick.datum.data, "best", 2024);
    if (lcoh === null) {
      setPickError(t("maskedCell"));
      return;
    }
    setPickError(null);
    applySite({ h3: pick.h3, lat: pick.lat, lon: pick.lon, lcoh });
    setPickerOpen(false);
  };

  const lineage = s.buildHere;

  return (
    <div className="sm:col-span-2 space-y-2">
      {/* Lineage chip */}
      {lineage && s.deliveredPriceUsdPerTonne != null && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-300 bg-emerald-500/10 px-2.5 py-2 text-xs dark:border-emerald-800">
          <span className="font-semibold tabular-nums">
            ${s.deliveredPriceUsdPerTonne.toLocaleString("en-US")}/t
          </span>
          <span className="text-neutral-600 dark:text-neutral-400">
            {t("chip", {
              cell: `${lineage.h3.slice(0, 6)}…`,
              lcoh: lineage.lcohUsdPerKg.toFixed(2),
              carrier: lineage.carrierId,
              km: Math.round(lineage.distanceKm),
            })}
          </span>
          <Link
            href={`/explorer${formatCameraHash({ lat: lineage.lat, lon: lineage.lon, zoom: 6.5, layer: "best", year: 2024 })}`}
            className="font-medium text-blue-600 hover:underline dark:text-blue-400"
            target="_blank"
          >
            {t("viewInExplorer")}
          </Link>
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            {pickerOpen ? t("hideMap") : t("repick")}
          </button>
        </div>
      )}

      {/* Synthesis config (D7: production-side WACC, separate from corridor WACC) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            ["productionWacc", t("productionWacc"), 0.005, "fraction"],
            ["electricityUsdPerMwh", t("electricity"), 5, "$/MWh"],
            ...(carrier.co2TPerTonne > 0
              ? ([["co2UsdPerTonne", t("co2Price"), 5, "$/t"]] as const)
              : []),
            ["distanceKm", t("distance"), 10, "km"],
          ] as const
        ).map(([key, label, step, unit]) => (
          <label key={key} className="block text-[11px] text-neutral-600 dark:text-neutral-400">
            {label}
            <span className="mt-0.5 flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900">
              <input
                type="number"
                step={step}
                value={config[key]}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  const next = { ...config, [key]: n };
                  setConfig(next);
                }}
                className="min-w-0 flex-1 bg-transparent text-xs tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="shrink-0 text-[10px] text-neutral-500">{unit}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="text-[10px] leading-snug text-neutral-500">{t("configNote")}</p>

      {pickError && (
        <p className="rounded-md bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-500">
          {pickError}
        </p>
      )}

      {/* The embedded map — same component as the Explorer, narrowed job */}
      {pickerOpen && (
        <div className="relative h-72 overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
          <HexplorerMap embedded onSitePicked={onSitePicked} />
        </div>
      )}
      {!pickerOpen && !lineage && (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium dark:border-neutral-700"
        >
          {t("openMap")}
        </button>
      )}
    </div>
  );
}
