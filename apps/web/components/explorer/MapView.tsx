"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { COORD_STEP, quantizeCoord } from "@h2map/profile-service";

const LIGHT_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

interface Props {
  selected: { lat: number; lon: number } | null;
  onSelect: (lat: number, lon: number) => void;
}

/** Cell polygon around the quantized coordinate (the cache cell being computed). */
function cellPolygon(lat: number, lon: number): GeoJSON.Feature {
  const latR = quantizeCoord(lat);
  const lonR = quantizeCoord(lon);
  const h = COORD_STEP / 2;
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [lonR - h, latR - h],
          [lonR + h, latR - h],
          [lonR + h, latR + h],
          [lonR - h, latR + h],
          [lonR - h, latR - h],
        ],
      ],
    },
  };
}

export default function MapView({ selected, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: dark ? DARK_STYLE : LIGHT_STYLE,
      center: [-20, 10],
      zoom: 1.6,
      attributionControl: { compact: false },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
    map.on("load", () => {
      map.addSource("cell", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "cell-fill",
        type: "fill",
        source: "cell",
        paint: { "fill-color": "#2a78d6", "fill-opacity": 0.15 },
      });
      map.addLayer({
        id: "cell-line",
        type: "line",
        source: "cell",
        paint: { "line-color": "#2a78d6", "line-width": 1.5 },
      });
    });
    map.on("click", (e: maplibregl.MapMouseEvent) => {
      onSelectRef.current(e.lngLat.lat, e.lngLat.lng);
    });
    map.getCanvas().style.cursor = "crosshair";
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Reflect the selected point: marker + quantized cell outline.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!selected) {
      markerRef.current?.remove();
      markerRef.current = null;
      const src = map.getSource("cell") as maplibregl.GeoJSONSource | undefined;
      src?.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    const marker =
      markerRef.current ?? new maplibregl.Marker({ color: "#2a78d6" });
    markerRef.current = marker;
    marker.setLngLat([selected.lon, selected.lat]).addTo(map);
    const apply = () => {
      const src = map.getSource("cell") as maplibregl.GeoJSONSource | undefined;
      src?.setData({
        type: "FeatureCollection",
        features: [cellPolygon(selected.lat, selected.lon)],
      });
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [selected]);

  // Outer div owns positioning; maplibre stamps its own `position` class on
  // the inner container, so the inner div must size via h-full, not inset-0.
  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
