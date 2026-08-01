/**
 * Plant gate → bunker port logistics (build-plan 1.6). Deliberately thin for
 * v1: great-circle distance × a route factor × a carrier $/t·km rate. The
 * INTERFACE (coordinates + carrier rate in, $/t out) is fixed so a routing
 * engine can replace the internals later without touching callers.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_KM = 6371.0088; // IUGG mean radius

/** Great-circle distance, haversine. Pure. */
export function greatCircleKm(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface LogisticsConfig {
  /** Carrier freight rate, USD per tonne-km (see SYNTHESIS_BENCHMARKS). */
  usdPerTonneKm: number;
  /**
   * Real-route ÷ great-circle factor (sea detours, canal routings, first-mile
   * road). Default 1.3 — a routing engine replaces this, not the interface.
   */
  routeFactor?: number;
}

export function logisticsUsdPerTonne(
  plant: LatLon,
  port: LatLon,
  config: LogisticsConfig,
): number {
  return greatCircleKm(plant, port) * (config.routeFactor ?? 1.3) * config.usdPerTonneKm;
}

/** The delivered price the corridor consumes: plant gate + logistics. */
export function deliveredUsdPerTonne(
  gateUsdPerTonne: number,
  plant: LatLon,
  port: LatLon,
  config: LogisticsConfig,
): number {
  return gateUsdPerTonne + logisticsUsdPerTonne(plant, port, config);
}

export interface LogisticsLegResult {
  readonly distanceKm: number;
  /** Route-factored cost of moving the year's tonnage, USD/yr. */
  readonly annualOperatingUsd: number;
  readonly perTonne: number;
}

/**
 * Plant→port logistics leg for build-here (spec §4): great-circle distance ×
 * route factor × the carrier's $/t·km, at the corridor's annual tonnage.
 * v1 is deliberately simple — the interface is fixed so a routing engine can
 * replace the internals without touching callers.
 */
export function logisticsLeg(
  site: LatLon,
  port: LatLon,
  usdPerTonneKm: number,
  tonnesPerYear: number,
  routeFactor = 1.3,
): LogisticsLegResult {
  const distanceKm = greatCircleKm(site, port);
  const perTonne = distanceKm * routeFactor * usdPerTonneKm;
  return {
    distanceKm,
    perTonne,
    annualOperatingUsd: perTonne * tonnesPerYear,
  };
}
