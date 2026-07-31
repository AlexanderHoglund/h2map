"use client";

import { useEffect, useState } from "react";
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
  // The site's LCOH: seeded by the map pick (the cell's best-2024 value) and
  // freely adjustable afterwards — every knob recomputes the delivered price
  // live; no re-pick needed.
  const [siteLcoh, setSiteLcoh] = useState<number | null>(
    s.buildHere?.lcohUsdPerKg ?? null,
  );
  const [pickError, setPickError] = useState<string | null>(null);
  const [mapControls, setMapControls] = useState(false);

  let carrier: ReturnType<typeof getSynthesisBenchmark> | null = null;
  try {
    carrier = getSynthesisBenchmark(s.fuelId);
  } catch {
    carrier = null;
  }

  const onSitePicked = (pick: SitePick) => {
    if (!carrier) return;
    // Masked / failed-gate cells carry no best value — not selectable (3.3).
    const lcoh = layerValue(pick.datum.data, "best", 2024);
    if (lcoh === null) {
      setPickError(t("maskedCell"));
      return;
    }
    setPickError(null);
    setSiteLcoh(lcoh);
    update((d) => {
      // Delivered price + lineage are completed reactively below.
      d[side].buildHere = {
        h3: pick.h3,
        lat: pick.lat,
        lon: pick.lon,
        lcohUsdPerKg: lcoh,
        carrierId: carrier.carrierId,
        synthesisGateUsdPerTonne: 0,
        distanceKm: config.distanceKm,
        logisticsUsdPerTonne: 0,
      };
      d[side].deliveredPriceUsdPerTonne ??= 0;
    });
    setPickerOpen(false);
  };

  const lineage = s.buildHere;

  // Reactive delivered price: once a site exists, ANY knob (site LCOH,
  // production WACC, electricity, CO2, distance, carrier) recomputes the
  // delivered price + lineage. Writes only when the numbers actually change,
  // so the update cannot loop.
  const siteKey = lineage ? `${lineage.h3}` : null;
  useEffect(() => {
    // Hooks run unconditionally; the guards do the branching.
    if (!carrier || !siteKey || siteLcoh === null) return;
    const synth = synthesize(siteLcoh, carrier, config);
    const logistics = config.distanceKm * ROUTE_FACTOR * carrier.shippingUsdPerTonneKm;
    const delivered = Math.round((synth.gateUsdPerTonne + logistics) * 100) / 100;
    const gate = Math.round(synth.gateUsdPerTonne * 100) / 100;
    const logisticsR = Math.round(logistics * 100) / 100;
    const timer = setTimeout(() => update((d) => {
      const b = d[side].buildHere;
      if (!b) return;
      if (
        d[side].deliveredPriceUsdPerTonne === delivered &&
        b.lcohUsdPerKg === siteLcoh &&
        b.synthesisGateUsdPerTonne === gate &&
        b.distanceKm === config.distanceKm
      ) {
        return; // nothing changed — no state churn
      }
      d[side].deliveredPriceUsdPerTonne = delivered;
      b.lcohUsdPerKg = siteLcoh;
      b.carrierId = carrier.carrierId;
      b.synthesisGateUsdPerTonne = gate;
      b.distanceKm = config.distanceKm;
      b.logisticsUsdPerTonne = logisticsR;
    }), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, siteLcoh, config, carrier?.carrierId]);

  // Unsupported carriers (no synthesis pathway) — after all hooks.
  if (!carrier) {
    return (
      <p className="sm:col-span-2 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-800">
        {t("unsupportedCarrier", { fuel: s.fuelId })}
      </p>
    );
  }

  return (
    <div className="sm:col-span-2 space-y-2">
      {/* Lineage chip */}
      {lineage && s.deliveredPriceUsdPerTonne != null && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-300 bg-emerald-500/10 px-2.5 py-2 text-xs">
          <span className="font-semibold tabular-nums">
            ${s.deliveredPriceUsdPerTonne.toLocaleString("en-US")}/t
          </span>
          <span className="text-neutral-600">
            {t("chip", {
              cell: `${lineage.h3.slice(0, 6)}…`,
              lcoh: lineage.lcohUsdPerKg.toFixed(2),
              carrier: lineage.carrierId,
              km: Math.round(lineage.distanceKm),
            })}
          </span>
          <Link
            href={`/explorer${formatCameraHash({ lat: lineage.lat, lon: lineage.lon, zoom: 6.5, layer: "best", year: 2024 })}`}
            className="font-medium text-blue-600 hover:underline"
            target="_blank"
          >
            {t("viewInExplorer")}
          </Link>
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="font-medium text-blue-600 hover:underline"
          >
            {pickerOpen ? t("hideMap") : t("repick")}
          </button>
        </div>
      )}

      {/* Synthesis config (D7: production-side WACC, separate from corridor WACC) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {siteKey && siteLcoh !== null && (
          <label className="block text-[11px] text-neutral-600">
            {t("siteLcoh")}
            <span className="mt-0.5 flex items-center gap-1 rounded-md border border-emerald-400 bg-white px-2 py-1">
              <input
                type="number"
                step={0.05}
                value={siteLcoh}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n > 0) setSiteLcoh(n);
                }}
                className="min-w-0 flex-1 bg-transparent text-xs tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="shrink-0 text-[10px] text-neutral-500">$/kg</span>
            </span>
          </label>
        )}
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
          <label key={key} className="block text-[11px] text-neutral-600">
            {label}
            <span className="mt-0.5 flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-2 py-1">
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
        <p className="rounded-md bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-800">
          {pickError}
        </p>
      )}

      {/* The embedded map — same component as the Explorer, narrowed job */}
      {pickerOpen && (
        <>
          <div
            className={`relative overflow-hidden rounded-lg border border-neutral-200 ${
              mapControls ? "h-[28rem]" : "h-72"
            }`}
          >
            <HexplorerMap embedded onSitePicked={onSitePicked} showControls={mapControls} />
          </div>
          {/* Advanced: the full Explorer control stack (layer / cost year /
              basis / basemap / opacity + search + legend) on the embed. */}
          <details
            onToggle={(e) => setMapControls((e.target as HTMLDetailsElement).open)}
            className="rounded-md border border-dashed border-neutral-300 px-2.5 py-1.5"
          >
            <summary className="cursor-pointer select-none text-[11px] font-medium uppercase tracking-wide text-neutral-500">
              {t("advancedMap")}
            </summary>
            <p className="mt-1 text-[11px] leading-snug text-neutral-500">
              {t("advancedMapNote")}
            </p>
          </details>
        </>
      )}
      {!pickerOpen && !lineage && (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium"
        >
          {t("openMap")}
        </button>
      )}
    </div>
  );
}
