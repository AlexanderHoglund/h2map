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
import {
  isCostYear,
  isLayerKey,
  type Basemap,
  type CostYear,
  type HexDatum,
  type LayerBasis,
  type LayerKey,
} from "./types";
import { useHexCells } from "./useHexCells";
import { collectWithAncestors, enumerateViewport } from "./viewport";
import { lcohColor } from "./scale";

const LIGHT_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const DARK_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/**
 * Raster basemaps (no API key). Esri World Imagery for satellite and
 * OpenTopoMap for topography. Both are free but carry fair-use tile policies —
 * fine for this tool; swap in a keyed provider (e.g. MapTiler) if usage grows.
 */
const SATELLITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    "esri-imagery": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [{ id: "esri-imagery", type: "raster", source: "esri-imagery" }],
};

// Muted grayscale relief (Esri World Hillshade): shows topography via shading
// with almost no colour, so the coloured hexes stay legible on top — unlike the
// vivid OpenTopoMap.
const TOPO_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    "esri-hillshade": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 16,
      attribution: "Hillshade © Esri, USGS, NASA",
    },
  },
  layers: [{ id: "esri-hillshade", type: "raster", source: "esri-hillshade" }],
};

function basemapStyle(
  basemap: Basemap,
  dark: boolean,
): string | maplibregl.StyleSpecification {
  if (basemap === "satellite") return SATELLITE_STYLE;
  if (basemap === "topographic") return TOPO_STYLE;
  return dark ? DARK_STYLE : LIGHT_STYLE;
}

const DEFAULT_CAMERA = { lat: 10, lon: -20, zoom: 1.6 };
const VIEWPORT_DEBOUNCE_MS = 250;
const MOVE_RENDER_THROTTLE_MS = 200;
/**
 * Gap-filled children (partially refined ancestor) get a slight alpha dip so
 * the refined cells read as the real signal; unrefined areas render their
 * ancestor cell at full size and full opacity instead (see buildRenderData).
 */
const PARENT_FILL_ALPHA = Math.round(255 * 0.8);
/** Zoom past which the resolution stops refining (MAX_RES) — show the note. */
const MAX_DETAIL_ZOOM = 8;
const SEARCH_FLY_ZOOM = 6;
/** Flip the hover tooltip to the other side of the cursor near the edges. */
const TOOLTIP_EDGE_X = 180;
const TOOLTIP_EDGE_Y = 80;
const TOOLTIP_CURSOR_GAP = 12;

interface HoverState {
  x: number;
  y: number;
  /** Near the right/bottom edge — place the tooltip on the other side. */
  flipX: boolean;
  flipY: boolean;
  datum: HexDatum;
}

interface HexplorerMapProps {
  /** Open the split evaluate panel for a cell (from the drawer's "Evaluate here"). */
  onEvaluate?: (lat: number, lon: number) => void;
}

/** The Explorer map: maplibre basemap + deck.gl H3 hexagon choropleth. */
export default function HexplorerMap({ onEvaluate }: HexplorerMapProps = {}) {
  const t = useTranslations("explorer");
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const visibleIdsRef = useRef<string[]>([]);
  const cameraKeyRef = useRef("");
  const debounceRef = useRef<number | undefined>(undefined);
  /** Basemap layer the hexes slot beneath, so borders + labels stay on top. */
  const beforeIdRef = useRef<string | undefined>(undefined);
  /** Currently displayed resolution — the floor keeps hex sizes monotonic. */
  const displayedResRef = useRef(0);
  /** Last rendered frame, kept on screen while replacement cells load. */
  const lastDataRef = useRef<HexDatum[]>([]);

  const { engine, version, bump, loading } = useHexCells();

  // Matches the basemap style choice made at init; strokes use the surface
  // tone so adjacent fills read as separated tiles.
  const [isDark] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  const [layerKey, setLayerKey] = useState<LayerKey>(() => {
    if (typeof window === "undefined") return "best";
    const parsed = parseCameraHash(window.location.hash);
    return parsed && isLayerKey(parsed.layer) ? parsed.layer : "best";
  });
  const layerKeyRef = useRef(layerKey);
  const [costYear, setCostYear] = useState<CostYear>(() => {
    if (typeof window === "undefined") return 2024;
    const parsed = parseCameraHash(window.location.hash);
    return parsed && isCostYear(parsed.year) ? parsed.year : 2024;
  });
  const costYearRef = useRef(costYear);
  // Best-combination basis (P1 #5 WACC / #6 sizing). Ephemeral — not persisted
  // in the hash; the default resource-driven view is the shareable one.
  const [basis, setBasis] = useState<LayerBasis>("default");
  // Basemap choice. Changing it recreates the map with the new style; the
  // camera is preserved via the location hash. styleEpoch bumps on each style
  // load so the deck.gl hex layer re-applies with the correct beforeId.
  const [basemap, setBasemap] = useState<Basemap>("default");
  const [styleEpoch, setStyleEpoch] = useState(0);
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
        year: costYearRef.current,
      }),
    );
  }, []);

  // Layer + cost year live in the hash; keep the refs + hash in sync.
  useEffect(() => {
    layerKeyRef.current = layerKey;
    costYearRef.current = costYear;
    syncCameraHash();
  }, [layerKey, costYear, syncCameraHash]);

  /**
   * Re-enumerate the viewport and render whatever is already cached. Runs
   * throttled DURING camera movement so cached areas draw the moment they
   * scroll into view — no fetches here.
   */
  const renderViewport = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const zoom = map.getZoom();
    const bounds = map.getBounds();
    setMaxDetail(zoom >= MAX_DETAIL_ZOOM);
    const { ids } = enumerateViewport(
      {
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      },
      zoom,
    );
    visibleIdsRef.current = ids;
    bump();
  }, [bump]);

  /** On camera settle: render + fetch anything unknown (incl. ancestors). */
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
    if (!info.object) {
      setHover(null);
      return;
    }
    const container = containerRef.current;
    setHover({
      x: info.x,
      y: info.y,
      flipX:
        container != null && info.x > container.clientWidth - TOOLTIP_EDGE_X,
      flipY:
        container != null && info.y > container.clientHeight - TOOLTIP_EDGE_Y,
      datum: info.object,
    });
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
      style: basemapStyle(basemap, dark),
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

    // Keep the GL canvas sized to its container. maplibre only measures at init
    // and on window resize, so when the container box changes (the evaluate
    // split panel opening/closing beside it) the map must be told to resize;
    // the interleaved deck.gl overlay shares the viewport and follows. rAF
    // coalesces the burst of events during the panel transition. resize() does
    // not move the camera, so it never rewrites the camera hash.
    let resizeRaf = 0;
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => mapRef.current?.resize());
    });
    resizeObserver.observe(container);

    const onMoveEnd = () => {
      syncCameraHash();
      window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(
        loadViewport,
        VIEWPORT_DEBOUNCE_MS,
      );
    };
    // Throttled render during the gesture keeps cached hexes on screen the
    // moment they scroll into view instead of waiting for the settle.
    let lastMoveRender = 0;
    const onMove = () => {
      const now = performance.now();
      if (now - lastMoveRender < MOVE_RENDER_THROTTLE_MS) return;
      lastMoveRender = now;
      renderViewport();
    };
    map.on("move", onMove);
    map.on("moveend", onMoveEnd);
    map.on("zoomend", onMoveEnd);
    map.on("load", () => {
      // First boundary line or label layer of the basemap style — hexes
      // render beneath it so country borders and place names stay visible.
      const layers = map.getStyle().layers ?? [];
      beforeIdRef.current = layers.find(
        (l) => l.type === "symbol" || l.id.includes("boundary"),
      )?.id;
      syncCameraHash();
      loadViewport();
      // Re-apply the hex layer now the style (and its beforeId) is known —
      // covers first load and every basemap switch.
      setStyleEpoch((e) => e + 1);
    });

    return () => {
      window.clearTimeout(debounceRef.current);
      cancelAnimationFrame(resizeRaf);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, [syncCameraHash, loadViewport, renderViewport, basemap]);

  // Rebuild the deck.gl layer whenever data or display settings change.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    let { data, res } = buildRenderData(
      engine.cache,
      visibleIdsRef.current,
      layerKey,
      costYear,
      basis,
      displayedResRef.current,
    );
    if (data.length === 0) {
      // Empty because cells are still in flight (unknown ids) — keep the
      // previous frame instead of blanking; genuinely empty views (ocean,
      // all ids known-missing) do clear.
      const anyUnknown = visibleIdsRef.current.some(
        (id) => !engine.cache.has(id),
      );
      if (anyUnknown && lastDataRef.current.length > 0) {
        data = lastDataRef.current;
        res = displayedResRef.current;
      }
    }
    lastDataRef.current = data;
    displayedResRef.current = res;
    // Only pass beforeId if that layer actually exists in the current style —
    // otherwise deck throws ("Cannot add layer before non-existing layer").
    // Raster basemaps (satellite / topographic) have no such layer, so the
    // hexes render on top; the vector style slots them beneath its labels.
    const beforeId =
      beforeIdRef.current && mapRef.current?.getLayer(beforeIdRef.current)
        ? beforeIdRef.current
        : undefined;
    overlay.setProps({
      layers: [
        new H3HexagonLayer<HexDatum>({
          id: "lcoh-hex",
          // beforeId is a MapboxOverlay extension prop (absent from the
          // layer's own prop types): slot the hexes beneath basemap labels.
          ...({ beforeId } as unknown as Record<string, never>),
          data,
          visible: layerVisible,
          opacity: opacity / 100,
          pickable: true,
          filled: true,
          extruded: false,
          stroked: true,
          getLineColor: isDark ? [26, 26, 25, 200] : [252, 252, 251, 220],
          lineWidthUnits: "pixels",
          getLineWidth: 1,
          lineWidthMinPixels: 1,
          lineWidthMaxPixels: 1.5,
          getHexagon: (d) => d.h3,
          getFillColor: (d) => {
            const [r, g, b] = lcohColor(d.value, layerKey);
            return [r, g, b, d.parentFill ? PARENT_FILL_ALPHA : 255];
          },
          updateTriggers: { getFillColor: [layerKey, costYear, basis] },
          onHover: onHexHover,
          onClick: onHexClick,
        }),
      ],
    });
  }, [version, layerKey, costYear, basis, opacity, layerVisible, engine, isDark, onHexHover, onHexClick, styleEpoch]);

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
          basis={basis}
          onBasisChange={setBasis}
          basemap={basemap}
          onBasemapChange={setBasemap}
          costYear={costYear}
          onCostYearChange={setCostYear}
          opacity={opacity}
          onOpacityChange={setOpacity}
          visible={layerVisible}
          onVisibleChange={setLayerVisible}
        />
        <SearchBox onNavigate={flyTo} />
      </div>

      {loading && (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
        >
          <span className="sr-only">{t("loading")}</span>
          <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-neutral-400/40 border-t-blue-600 dark:border-neutral-500/40 dark:border-t-blue-400" />
        </div>
      )}

      <Legend layerKey={layerKey} basis={basis} maxDetail={maxDetail} />

      {hover && (
        <div
          className="pointer-events-none absolute z-30 rounded-lg border border-neutral-200 bg-white/95 px-2 py-1 text-xs backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95"
          style={{
            left:
              hover.x + (hover.flipX ? -TOOLTIP_CURSOR_GAP : TOOLTIP_CURSOR_GAP),
            top:
              hover.y + (hover.flipY ? -TOOLTIP_CURSOR_GAP : TOOLTIP_CURSOR_GAP),
            transform: `translate(${hover.flipX ? "-100%" : "0"}, ${hover.flipY ? "-100%" : "0"})`,
          }}
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
        layerKey={layerKey}
        basis={basis}
        costYear={costYear}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onEvaluate={onEvaluate}
      />
    </div>
  );
}
