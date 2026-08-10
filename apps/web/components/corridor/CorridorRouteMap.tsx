"use client";

import { useTranslations } from "next-intl";
import { formatSig } from "@h2map/units";
import {
  corridorCenterLon,
  greatCirclePoints,
  lonExtent,
  makeProjection,
  wrapLine,
  wrapLon,
  type LonLat,
  type Projection,
} from "@/lib/routeMapGeometry";
import type { SeaRouteState } from "./useSeaRoute";
import { LAND } from "./routeMapLand";

/**
 * The corridor drawn as the route the ship actually sails — around
 * continents, through canals — over bundled Natural Earth coastlines.
 * Static SVG by choice (recorded decision): MapLibre would cost ~800 KB of
 * JS plus third-party basemap tiles for what is a deterministic,
 * report-exportable schematic; the coastline module is 68 KB and already
 * licensed. Renders on Intro; built prop-driven for reuse (Overview,
 * report export).
 *
 * Every failure path degrades, never blocks: routed track → great-circle
 * schematic → single port → a placeholder inviting coordinates.
 */

interface Coords {
  lat: number;
  lon: number;
}

interface Props {
  routeType: "point-to-point" | "single-point";
  portA?: { name?: string; coords?: Coords };
  portB?: { name?: string; coords?: Coords };
  route: SeaRouteState;
  typedDistanceNm: number;
  /** Evaluated build-here production site, if any (Energy domain). */
  site?: Coords | null;
}

const W = 720;
const H = 300;
/** The animations' label styling: mono, letter-spaced, on a page-tone
 *  plate so the grid of coastlines never strikes through a name. */
const MONO_FONT = "var(--font-mono, ui-monospace, monospace)";
const plateWidth = (text: string, size: number) => text.length * (size * 0.62) + 10;

/** Canal marker positions (lon, lat). */
const CANALS: Record<string, { at: LonLat; label: "Panama" | "Suez" }> = {
  panama: { at: [-79.6, 9.0], label: "Panama" },
  suez: { at: [32.35, 30.5], label: "Suez" },
};

function landPaths(proj: Projection): string[] {
  const paths: string[] = [];
  for (const ring of LAND) {
    // Rings stay at RAW longitudes (they are continuous; wrapping vertices
    // would tear any ring the wrap boundary crosses into a streak). Copies
    // shifted by ±360° cover whichever side of the corridor window the
    // ring appears on; off-view copies are culled by extent.
    const [minLon, maxLon] = lonExtent(ring);
    for (const shift of [-720, -360, 0, 360]) {
      const left = proj.x(minLon + shift);
      const right = proj.x(maxLon + shift);
      if (right < -40 || left > proj.width + 40) continue;
      const d = ring
        .map(([lon, lat], i) => {
          const x = proj.x(lon + shift);
          const y = proj.y(lat);
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join("");
      paths.push(`${d}Z`);
    }
  }
  return paths;
}

export default function CorridorRouteMap({
  routeType,
  portA,
  portB,
  route,
  typedDistanceNm,
  site,
}: Props) {
  const t = useTranslations("corridor.routeMap");

  const a = portA?.coords;
  const b = routeType === "point-to-point" ? portB?.coords : undefined;
  const hasA = a && (a.lat !== 0 || a.lon !== 0);
  const hasB = b && (b.lat !== 0 || b.lon !== 0);

  // Coordinates unset → placeholder inviting the Ports tab. (0,0) is the
  // unset sentinel the coordinate inputs render for absent values.
  if (!hasA || (routeType === "point-to-point" && !hasB)) {
    return (
      <div className="sm:col-span-2 flex h-40 items-center justify-center border border-dashed border-neutral-300 bg-white px-4 text-center text-xs text-neutral-500">
        {t("placeholder")}
      </div>
    );
  }

  const routed = route.status === "ok" && route.data ? route.data : null;
  const centerLon = hasB ? corridorCenterLon(a.lon, b.lon) : a.lon;

  // Points of interest fix the projection window.
  const poi: LonLat[] = [[a.lon, a.lat]];
  if (hasB) poi.push([b.lon, b.lat]);
  if (site) poi.push([site.lon, site.lat]);
  if (routed) {
    for (const line of routed.geometry.coordinates) {
      for (const p of line) poi.push([p[0]!, p[1]!]);
    }
  } else if (hasB) {
    for (const p of greatCirclePoints([a.lon, a.lat], [b.lon, b.lat], 32)) poi.push(p);
  }
  const proj = makeProjection(poi, W, H, 30, centerLon);

  // Track: routed parts, or the dashed great-circle schematic.
  const trackParts: LonLat[][] = routed
    ? routed.geometry.coordinates.flatMap((line) =>
        wrapLine(line.map((p) => [p[0]!, p[1]!] as LonLat), centerLon),
      )
    : hasB
      ? wrapLine(greatCirclePoints([a.lon, a.lat], [b.lon, b.lat]), centerLon)
      : [];

  // Affine projection expects wrapped longitudes — wrap single points here
  // (track parts and land rings arrive pre-wrapped).
  const px = (lon: number) => proj.x(wrapLon(lon, centerLon));

  const toPath = (part: LonLat[]) =>
    part
      .map(([lon, lat], i) => `${i === 0 ? "M" : "L"}${proj.x(lon).toFixed(1)} ${proj.y(lat).toFixed(1)}`)
      .join("");

  // Distance label rides the middle of the longest track part.
  const longest = trackParts.reduce<LonLat[]>(
    (best, p) => (p.length > best.length ? p : best),
    [],
  );
  const mid = longest[Math.floor(longest.length / 2)];
  const distanceNm = routed ? routed.nm : typedDistanceNm;

  const canal = routed?.via ? CANALS[routed.via] : undefined;

  return (
    <figure className="sm:col-span-2 border border-neutral-300 bg-white p-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={t("aria")}
        className="h-auto w-full"
      >
        <rect width={W} height={H} fill="var(--color-page)" />
        {landPaths(proj).map((d, i) => (
          <path key={i} d={d} fill="var(--viz-grid)" stroke="none" />
        ))}

        {/* The track */}
        {trackParts.map((part, i) => (
          <path
            key={`t${i}`}
            d={toPath(part)}
            fill="none"
            stroke="var(--anim-ink)"
            strokeWidth={1.8}
            strokeDasharray={routed ? undefined : "5 4"}
            strokeLinecap="round"
          />
        ))}

        {/* Production site + straight plant→port leg (Energy domain). */}
        {site && (
          <g>
            <line
              x1={px(site.lon)}
              y1={proj.y(site.lat)}
              x2={px(a.lon)}
              y2={proj.y(a.lat)}
              stroke="var(--domain-energy-text)"
              strokeWidth={1.2}
              strokeDasharray="3 3"
            />
            <rect
              x={px(site.lon) - 4}
              y={proj.y(site.lat) - 4}
              width={8}
              height={8}
              fill="var(--domain-energy-text)"
            />
            <text
              x={px(site.lon) + 8}
              y={proj.y(site.lat) + 4}
              fontSize={10}
              fontFamily={MONO_FONT}
              letterSpacing={1}
              fill="var(--domain-energy-text)"
            >
              {t("site")}
            </text>
          </g>
        )}

        {/* Canal transit marker. */}
        {canal && (
          <g>
            <path
              d={`M${px(canal.at[0])} ${proj.y(canal.at[1]) - 6} l6 6 l-6 6 l-6 -6 Z`}
              fill="var(--color-page)"
              stroke="var(--anim-ink)"
              strokeWidth={1.4}
            />
            <text
              x={px(canal.at[0]) + 10}
              y={proj.y(canal.at[1]) + 4}
              fontSize={10}
              fontFamily={MONO_FONT}
              letterSpacing={1}
              fill="var(--viz-ink-secondary)"
            >
              {canal.label}
            </text>
          </g>
        )}

        {/* Ports (Ports domain colour). */}
        {[
          { p: a, name: portA?.name, anchor: "start" as const },
          ...(hasB ? [{ p: b, name: portB?.name, anchor: "start" as const }] : []),
        ].map(({ p, name }, i) => (
          <g key={`p${i}`}>
            <circle
              cx={px(p.lon)}
              cy={proj.y(p.lat)}
              r={4}
              fill="var(--domain-ports-text)"
            />
            {name ? (
              <g>
                <rect
                  x={px(p.lon) + 6}
                  y={proj.y(p.lat) - 18}
                  width={plateWidth(name, 11)}
                  height={15}
                  fill="var(--color-page)"
                  opacity={0.9}
                />
                <text
                  x={px(p.lon) + 10}
                  y={proj.y(p.lat) - 7}
                  fontSize={11}
                  fontFamily={MONO_FONT}
                  letterSpacing={1}
                  fill="var(--domain-ports-text)"
                >
                  {name}
                </text>
              </g>
            ) : null}
          </g>
        ))}

        {/* Distance label on the track. */}
        {mid && hasB && (
          <g>
            <rect
              x={px(mid[0]) - 34}
              y={proj.y(mid[1]) - 22}
              width={68}
              height={16}
              fill="var(--color-page)"
              opacity={0.9}
            />
            <text
              x={px(mid[0])}
              y={proj.y(mid[1]) - 10}
              fontSize={11}
              fontFamily={MONO_FONT}
              letterSpacing={1}
              textAnchor="middle"
              fill="var(--anim-ink)"
            >
              {formatSig(distanceNm)} nm
            </text>
          </g>
        )}
      </svg>
      <figcaption className="mt-1 flex items-center justify-between px-1 font-mono text-[10px] tracking-wide text-neutral-500">
        <span>{routed ? t("indicative") : hasB ? t("schematic") : t("portOnly")}</span>
        {route.status === "loading" ? <span>{t("loading")}</span> : null}
      </figcaption>
    </figure>
  );
}
