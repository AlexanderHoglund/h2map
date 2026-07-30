import { readFileSync } from "node:fs";
import path from "node:path";
import { parseRefBundle, type RefBundle } from "@h2map/corridor-schema";

/**
 * Server-side reference-bundle loader. Bundles are immutable
 * (`data/corridor-ref/<bundleId>.json`), so a parsed bundle is cached for the
 * process lifetime. Throws on unknown id — a scenario pinning a bundle this
 * deployment doesn't ship is an error, never a silent fallback.
 */

const cache = new Map<string, RefBundle>();

/** data/ lives at the repo root; dev cwd is apps/web, prod may differ. */
function bundlePath(bundleId: string): string {
  // Defense: bundle ids come from client payloads — never let them traverse.
  if (!/^[a-z0-9-]+$/i.test(bundleId)) {
    throw new Error(`invalid bundle id: ${bundleId}`);
  }
  const candidates = [
    path.resolve(process.cwd(), `data/corridor-ref/${bundleId}.json`),
    path.resolve(process.cwd(), `../../data/corridor-ref/${bundleId}.json`),
  ];
  for (const p of candidates) {
    try {
      readFileSync(p);
      return p;
    } catch {
      /* try next */
    }
  }
  throw new Error(`reference bundle not found: ${bundleId}`);
}

export function loadRefBundle(bundleId: string): RefBundle {
  const hit = cache.get(bundleId);
  if (hit) return hit;
  const bundle = parseRefBundle(
    JSON.parse(readFileSync(bundlePath(bundleId), "utf8")),
  );
  cache.set(bundleId, bundle);
  return bundle;
}
