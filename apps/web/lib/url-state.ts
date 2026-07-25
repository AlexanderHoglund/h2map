import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";

/**
 * URL-state codecs: every view state is a URL. The map camera (+ layer
 * choices) lives in the location hash so panning rewrites no history; the
 * calculator configuration compresses into a `c` query param.
 */

export interface CameraState {
  lat: number;
  lon: number;
  zoom: number;
  /** Explorer layer key, e.g. "best" | "solar" | "wind". */
  layer?: string;
  /** Cost year, e.g. 2024 | 2030 | 2040 | 2050. */
  year?: number;
}

/** `#@lat,lon,zoom[,layer[,year]]` — layer is emitted when a year is present. */
export function formatCameraHash(c: CameraState): string {
  const base = `#@${c.lat.toFixed(4)},${c.lon.toFixed(4)},${c.zoom.toFixed(2)}`;
  const needYear = c.year != null && c.year !== 2024;
  const layer = c.layer && c.layer !== "best" ? c.layer : needYear ? "best" : "";
  let out = base;
  if (layer) out += `,${layer}`;
  if (needYear) out += `,${c.year}`;
  return out;
}

export function parseCameraHash(hash: string): CameraState | null {
  const m =
    /^#@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)(?:,([a-z]+))?(?:,(\d{4}))?$/.exec(
      hash,
    );
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  const zoom = Number(m[3]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || zoom < 0 || zoom > 22) {
    return null;
  }
  return { lat, lon, zoom, layer: m[4], year: m[5] ? Number(m[5]) : undefined };
}

export function encodeConfigParam(config: unknown): string {
  return compressToEncodedURIComponent(JSON.stringify(config));
}

export function decodeConfigParam<T>(param: string): T | null {
  try {
    const json = decompressFromEncodedURIComponent(param);
    if (!json) return null;
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
