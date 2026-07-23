"use client";

import type { PickingInfo } from "@deck.gl/core";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatCameraHash, parseCameraHash } from "@/lib/url-state";
import { buildRenderData } from "./cellCache";
import CellDrawer from "./CellDrawer";
import LayerControls from "./LayerControls";
import Legend from "./Legend";
import SearchBox from "./SearchBox";
import { isLayerKey, type HexDatum, type LayerKey } from "./types";
import { useHexCells } from "./useHexCells";
import { collectWithAncestors, enumerateViewport } from "./viewport";
import { viridisColor } from "./viridis";

const LIGHT_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const DARK_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const DEFAULT_CAMERA = { lat: 10, lon: -20, zoom: 1.6 };
const VIEWPORT_DEBOUNCE_MS = 250;
/**
 * Gap-filled children (partially refined ancestor) get a slight alpha dip so
 * the refined cells read as the real signal; unrefined areas render their
 * ancestor cell at full size and full opacity instead (see buildRenderData).
 */
const PARENT_FILL_ALPHA = Math.round(255 * 0.8);
/** Zoom past which the resolution stops refining (MAX_RES) — show the note. */
const MAX_DETAIL_ZOOM = 6.5;
const SEARCH_FLY_ZOOM = 6;

interface HoverState {
  x: number;
  y: number;
  datum: HexDatum;
}

/** The Explorer map: maplibre basemap + deck.gl H3 hexagon choropleth. */
export default function HexplorerMap() {
  const t = useTranslations("explorer");
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const visibleIdsRef = useRef<string[]>([]);
  const cameraKeyRef = useRef("");
  const debounceRef = useRef<number | undefined>(undefined);

  const { engine, version, bump } = useHexCells();

  const [layerKey, setLayerKey] = useState<LayerKey>(() => {
    if (typeof window === "undefined") return "best";
    const parsed = parseCameraHash(window.location.hash);
    return parsed && isLayerKey(parsed.layer) ? parsed.layer : "best";
  });
  const layerKeyRef = useRef(layerKey);
  const [opacity, setOpacity] = useState(75);
  const [layerVisible, setLayerVisible] = useState(true);
  const [maxDetail, setMaxDetail] = useState(false);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [selected, setSelected] = useState<HexDatum | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  /** Write the current camera (+ layer) into the location hash. */
  const syncCameraHash = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const center = map.getCenter();
    window.history.replaceState(
      null,
      "",
      formatCameraHash({
        lat: center.lat,
        lon: center.lng,
        zoom: map.getZoom(),
        layer: layerKeyRef.current,
      }),
    );
  }, []);

  // Layer choice is the hash's 4th component; keep the ref + hash in sync.
  useEffect(() => {
    layerKeyRef.current = layerKey;
    syncCameraHash();
  }, [layerKey, syncCameraHash]);

  /** Enumerate visible cells, fetch unknown ones, and bump the version. */
  const loadViewport = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const zoom = map.getZoom();
    const bounds = map.getBounds();
    const key = [
      zoom.toFixed(3),
      bounds.getWest().toFixed(4),
      bounds.getSouth().toFixed(4),
      bounds.getEast().toFixed(4),
      bounds.getNorth().toFixed(4),
    ].join("|");
    if (key === cameraKeyRef.current) return; // camera unchanged
    cameraKeyRef.current = key;
    setMaxDetail(zoom >= MAX_DETAIL_ZOOM);
    const { ids, res } = enumerateViewport(
      {
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      },
      zoom,
    );
    visibleIdsRef.current = ids;
    engine.requestCells(collectWithAncestors(ids, res));
    bump(); // render whatever is already cached immediately
  }, [engine, bump]);

  const onHexHover = useCallback((info: PickingInfo<HexDatum>) => {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = info.object ? "pointer" : "";
    setHover(
      info.object ? { x: info.x, y: info.y, datum: info.object } : null,
    );
  }, []);

  const onHexClick = useCallback((info: PickingInfo<HexDatum>) => {
    if (info.object) {
      setSelected(info.object);
      setDrawerOpen(true);
    } else {
      setDrawerOpen(false);
    }
  }, []);

  // Map + overlay init (once).
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    const parsed = parseCameraHash(window.location.hash);
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const map = new maplibregl.Map({
      container,
      style: dark ? DARK_STYLE : LIGHT_STYLE,
      center: [
        parsed?.lon ?? DEFAULT_CAMERA.lon,
        parsed?.lat ?? DEFAULT_CAMERA.lat,
      ],
      zoom: parsed?.zoom ?? DEFAULT_CAMERA.zoom,
      attributionControl: { compact: false },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
    const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
    map.addControl(overlay as unknown as maplibregl.IControl);
    overlayRef.current = overlay;
    mapRef.current = map;

    const onMoveEnd = () => {
      syncCameraHash();
      window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(
        loadViewport,
        VIEWPORT_DEBOUNCE_MS,
      );
    };
    map.on("moveend", onMoveEnd);
    map.on("zoomend", onMoveEnd);
    map.on("load", () => {
      syncCameraHash();
      loadViewport();
    });

    return () => {
      window.clearTimeout(debounceRef.current);
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, [syncCameraHash, loadViewport]);

  // Rebuild the deck.gl layer whenever data or display settings change.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const data = buildRenderData(engine.cache, visibleIdsRef.current, layerKey);
    overlay.setProps({
      layers: [
        new H3HexagonLayer<HexDatum>({
          id: "lcoh-hex",
          data,
          visible: layerVisible,
          opacity: opacity / 100,
          pickable: true,
          filled: true,
          extruded: false,
          stroked: false,
          getHexagon: (d) => d.h3,
          getFillColor: (d) => {
            const [r, g, b] = viridisColor(d.value);
            return [r, g, b, d.parentFill ? PARENT_FILL_ALPHA : 255];
          },
          onHover: onHexHover,
          onClick: onHexClick,
        }),
      ],
    });
  }, [version, layerKey, opacity, layerVisible, engine, onHexHover, onHexClick]);

  const flyTo = useCallback((lat: number, lon: number) => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: [lon, lat],
      zoom: Math.max(map.getZoom(), SEARCH_FLY_ZOOM),
    });
  }, []);

  const hoverSource = (datum: HexDatum): string => {
    if (layerKey !== "best") return t(`tooltip.sources.${layerKey}`);
    const pv = datum.data.bestPvMw ?? 0;
    const wind = datum.data.bestWindMw ?? 0;
    if (pv > wind) return t("tooltip.sources.solar");
    if (wind > pv) return t("tooltip.sources.wind");
    return t("tooltip.sources.mix");
  };

  return (
    <div className="absolute inset-0">
      {/* maplibre stamps its own position class on this div, so the parent
          owns positioning and the inner container sizes via h-full. */}
      <div ref={containerRef} className="h-full w-full" />

      <div className="absolute left-4 top-4 z-10 flex w-64 flex-col gap-2">
        <LayerControls
          layerKey={layerKey}
          onLayerChange={setLayerKey}
          opacity={opacity}
          onOpacityChange={setOpacity}
          visible={layerVisible}
          onVisibleChange={setLayerVisible}
        />
        <SearchBox onNavigate={flyTo} />
      </div>

      <Legend layerKey={layerKey} maxDetail={maxDetail} />

      {hover && (
        <div
          className="pointer-events-none absolute z-30 rounded-md border border-neutral-200 bg-white/95 px-2 py-1 text-xs backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <p className="tabular-nums font-medium">
            {hover.datum.value.toFixed(2)} {t("tooltip.unit")}
          </p>
          <p className="text-neutral-500 dark:text-neutral-400">
            {hoverSource(hover.datum)}
          </p>
        </div>
      )}

      <CellDrawer
        datum={selected}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
