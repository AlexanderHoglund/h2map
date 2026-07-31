"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { getSynthesisBenchmark } from "@h2map/corridor-schema";
import { synthesize } from "@h2map/corridor-engine";
import type { CorridorModel } from "./state";

/**
 * "Build here" (build-plan 3.3), integrated-workspace edition: the site is
 * picked on THE map — the always-present center canvas (cell drawer → "use as
 * corridor fuel site" → model.pickSite). This panel holds the synthesis
 * config: delivered price = site LCOH → carrier synthesis (plant annuitized
 * at the PRODUCTION-side WACC, divergence D7) → logistics to the bunker
 * port. Every knob recomputes the delivered price live.
 */

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

  let carrier: ReturnType<typeof getSynthesisBenchmark> | null = null;
  try {
    carrier = getSynthesisBenchmark(s.fuelId);
  } catch {
    carrier = null;
  }

  const lineage = s.buildHere;
  const siteKey = lineage ? `${lineage.h3}` : null;

  // A NEW pick from the map (different cell) re-seeds the local knobs.
  const lastH3 = useRef<string | null>(siteKey);
  useEffect(() => {
    if (siteKey && siteKey !== lastH3.current && lineage) {
      lastH3.current = siteKey;
      setSiteLcoh(lineage.lcohUsdPerKg);
      setConfig((c) => ({ ...c, distanceKm: lineage.distanceKm }));
    }
  }, [siteKey, lineage]);

  // Reactive delivered price: once a site exists, ANY knob (site LCOH,
  // production WACC, electricity, CO2, distance, carrier) recomputes the
  // delivered price + lineage. Writes only when the numbers actually change,
  // so the update cannot loop.
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
      <p className="sm:col-span-2 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-800">
        {t("unsupportedCarrier", { fuel: s.fuelId })}
      </p>
    );
  }

  return (
    <div className="sm:col-span-2 space-y-2">
      {/* No site yet: the map is right there — point at it */}
      {!lineage && (
        <p className="border border-dashed border-brand/50 bg-brand-tint px-2.5 py-2 text-[11px] leading-snug text-brand-deep">
          {t("pickOnMap")}
        </p>
      )}

      {/* Lineage chip */}
      {lineage && s.deliveredPriceUsdPerTonne != null && (
        <div className="flex flex-wrap items-center gap-2 border border-emerald-300 bg-emerald-500/10 px-2.5 py-2 text-xs">
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
          <span className="text-[11px] text-neutral-600">{t("repickNote")}</span>
        </div>
      )}

      {/* Synthesis config (D7: production-side WACC, separate from corridor WACC) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {siteKey && siteLcoh !== null && (
          <label className="block text-[11px] text-neutral-600">
            {t("siteLcoh")}
            <span className="mt-0.5 flex items-center gap-1 border border-emerald-400 bg-white px-2 py-1">
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
              <span className="shrink-0 text-[10px] text-neutral-600">$/kg</span>
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
            <span className="mt-0.5 flex items-center gap-1 border border-neutral-300 bg-white px-2 py-1">
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
              <span className="shrink-0 text-[10px] text-neutral-600">{unit}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="text-[10px] leading-snug text-neutral-500">{t("configNote")}</p>
    </div>
  );
}
