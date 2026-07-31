"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const LIGHT_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

interface Props {
  lat: number;
  lon: number;
  onChange: (lat: number, lon: number) => void;
}

/**
 * Mini location picker: draggable marker, click-to-move, two-way synced with
 * the latitude/longitude inputs. The outer div owns positioning/height —
 * maplibre stamps its own `position` class on the inner container, so the
 * inner div must size via h-full, not inset-0.
 */
export default function MiniMap({ lat, lon, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: LIGHT_STYLE,
      center: [lon, lat],
      zoom: 3.5,
      attributionControl: { compact: true },
    });
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    const marker = new maplibregl.Marker({ draggable: true, color: "#2563eb" })
      .setLngLat([lon, lat])
      .addTo(map);
    marker.on("dragend", () => {
      const p = marker.getLngLat().wrap();
      onChangeRef.current(p.lat, p.lng);
    });
    map.on("click", (e: maplibregl.MapMouseEvent) => {
      const p = e.lngLat.wrap();
      onChangeRef.current(p.lat, p.lng);
    });
    map.getCanvas().style.cursor = "crosshair";
    mapRef.current = map;
    markerRef.current = marker;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Initial center only — subsequent lat/lon changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Inputs → map: move the marker, pan only if it left the viewport.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const current = marker.getLngLat();
    if (Math.abs(current.lat - lat) < 1e-7 && Math.abs(current.lng - lon) < 1e-7) {
      return;
    }
    marker.setLngLat([lon, lat]);
    if (!map.getBounds().contains([lon, lat])) {
      map.easeTo({ center: [lon, lat], duration: 300 });
    }
  }, [lat, lon]);

  return (
    <div className="relative h-60 overflow-hidden rounded-md border border-neutral-300">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
