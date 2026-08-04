/**
 * Fixed-mount geometry (2026-08-04): we compute the panel tilt ourselves
 * instead of asking PVGIS for `optimalangles=1`, which returns non-physical
 * mountings near the equator (90° vertical north-facing, or a nonsense
 * azimuth, or HTTP 500) and put the no-data holes in Kenya's solar layer.
 */

import { describe, expect, it } from "vitest";
import { fetchPvgisPv, fixedMounting } from "../src/providers/pvgis";
import type { FetchJson } from "../src/types";

describe("fixedMounting — tilt ≈ |latitude|, equator-facing", () => {
  it("is near-flat at the equator (the case that was broken)", () => {
    expect(fixedMounting(0)).toEqual({ tiltDeg: 0, aspectDeg: 0 });
    // Kenya cells that rendered as no-data under optimalangles.
    expect(fixedMounting(-0.86)).toEqual({ tiltDeg: 1, aspectDeg: 180 });
    expect(fixedMounting(0.32)).toEqual({ tiltDeg: 0, aspectDeg: 0 });
  });

  it("tracks latitude at mid-latitudes", () => {
    expect(fixedMounting(-23.5).tiltDeg).toBe(24); // Atacama
    expect(fixedMounting(30).tiltDeg).toBe(30);
  });

  it("caps the tilt so high-latitude cells are not near-vertical", () => {
    expect(fixedMounting(40.4).tiltDeg).toBe(35); // Spain — capped
    expect(fixedMounting(64).tiltDeg).toBe(35);
    expect(fixedMounting(-70).tiltDeg).toBe(35);
  });

  it("faces the equator in BOTH hemispheres", () => {
    // Verified against the live API: aspect 0 is equator-facing in the north,
    // 180 in the south (see the provider docblock for the measurements).
    expect(fixedMounting(40.4).aspectDeg).toBe(0);
    expect(fixedMounting(-23.5).aspectDeg).toBe(180);
    expect(fixedMounting(0).aspectDeg).toBe(0);
  });
});

/** Minimal PVGIS-shaped response: one complete non-leap year at a flat CF. */
function stubResponse(cf: number) {
  const hourly = Array.from({ length: 8760 }, (_, i) => {
    const day = String(Math.floor(i / 24) + 1).padStart(3, "0");
    return { time: `2023${day}:${String(i % 24).padStart(2, "0")}00`, P: cf * 1000 };
  });
  return { inputs: { meteo_data: { radiation_db: "PVGIS-SARAH3" } }, outputs: { hourly } };
}

describe("fetchPvgisPv — request + dataset tag", () => {
  const capture = () => {
    const urls: string[] = [];
    const fetchJson: FetchJson = async (url: string) => {
      urls.push(url);
      return stubResponse(0.2);
    };
    return { urls, fetchJson };
  };

  it("sends an explicit angle/aspect and NEVER optimalangles", async () => {
    const { urls, fetchJson } = capture();
    await fetchPvgisPv(fetchJson, -0.86, 37.92, "pv_fixed");
    expect(urls[0]).toContain("&angle=1&aspect=180");
    expect(urls[0]).not.toContain("optimalangles");
  });

  it("encodes the mounting in the dataset tag (cache-collision guard)", async () => {
    // The cache key is (lat_r, lon_r, kind, mode, dataset_version). Without the
    // mounting in the tag, a re-mounted profile would silently upsert onto rows
    // computed under the old vertical-panel assumption.
    const { fetchJson } = capture();
    const kenya = await fetchPvgisPv(fetchJson, -0.86, 37.92, "pv_fixed");
    expect(kenya.datasetTag).toContain("-tilt1a180-");
    const spain = await fetchPvgisPv(fetchJson, 40.4, -3.7, "pv_fixed");
    expect(spain.datasetTag).toContain("-tilt35a0-");
    expect(spain.datasetTag).not.toBe(kenya.datasetTag);
  });

  it("reports the mounting in the provenance notes", async () => {
    const { fetchJson } = capture();
    const r = await fetchPvgisPv(fetchJson, -23.5, -69.4, "pv_fixed");
    expect(r.notes.some((n) => /tilt 24° aspect 180°/.test(n))).toBe(true);
  });

  it("leaves tracking kinds on PVGIS geometry (no fixed tilt to get wrong)", async () => {
    const { urls, fetchJson } = capture();
    await fetchPvgisPv(fetchJson, -0.86, 37.92, "pv_1axis");
    expect(urls[0]).toContain("trackingtype=1");
    expect(urls[0]).not.toContain("&angle=");
  });
});
