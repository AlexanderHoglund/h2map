# Phase 2 — profile service & API notes

## Profile service (`packages/profile-service`)

Zero-runtime-dependency package; HTTP (`fetchJson`), the cache, and the
turbine curve are injected, so everything is unit-testable offline
(`packages/profile-service/test/`). The app wires production deps in
`apps/web/lib/server/profiles.ts`.

### Provider fallback chain (ratified by the Phase 0 spike)

| Kind | Primary | Fallback | Rationale |
|---|---|---|---|
| `pv_fixed`, `pv_1axis`, `pv_2axis` | PVGIS `seriescalc` (own PV model, tracking geometry, temperature losses) | Open-Meteo crude GHI proxy (`provider: open-meteo-crude`) | PVGIS is authoritative for PV; the crude proxy is labeled so the fidelity drop is visible |
| `wind_120`, `wind_160` | Open-Meteo ERA5 archive (per-hour two-height shear 10 m/100 m) | NASA POWER `WS50M` (fixed α = 1/7) | Spike: NASA fixed-α runs up to +0.14 CF hot vs. two-height shear (`data/spike/comparison.json`) |

Wind uses the generic turbine curve from `turbine_curves` (seeded; mirror of
`data/turbines/generic-5.6MW.json`); capacity scales linearly per the source
methodology, the curve defines shape only.

### TMY builder (`src/tmy.ts`)

Finkelstein–Schafer month selection (ISO 15927-4 in spirit, one variable):
for each calendar month pick the source year whose empirical CDF of daily
mean CF is closest to the long-term pooled CDF, evaluated at every pooled
value (robust to tied/degenerate samples), then stitch. Ties break to the
earliest year — fully deterministic. Wind/crude-PV window: 2015–2024
(`OPEN_METEO_TMY_YEARS`); PVGIS: trailing ≤10 complete years of whatever the
auto-resolved radiation DB provides (window is encoded in `datasetVersion`).

- Leap years are trimmed to 8760 by dropping Feb 29 (engine hard-requires 8760).
- Provider gaps are linearly interpolated; a year with >5 % gap hours is
  dropped from the pool; a provider whose years all drop counts as failed.
- All timestamps UTC.

### Cache

`resource_profiles` keyed `(lat_r, lon_r, kind, dataset_version)`;
coordinates quantized to 0.1° (`COORD_STEP`). Reads take the newest row for
the coordinate/kind regardless of dataset version. Writes need the
service-role key (`SUPABASE_SECRET_KEY` in `apps/web/.env.local`) because the
table intentionally has no RLS insert policy; without it the service logs a
warning and serves uncached. Cache is best-effort: read/write failures never
fail a request.

## API (`/api/v1`)

Self-describing: `GET /api/v1/openapi.json` (OpenAPI 3.1; request schemas
derived from the zod boundary schemas in `apps/web/lib/api/schemas.ts`).

- `GET /api/v1/resource-profiles?lat=&lon=&kind=` — cached-or-built TMY
  profile with provenance (`provider`, `datasetVersion`, `attribution`,
  `build` metadata on fresh builds). Cache misses fan out to providers
  (~10 sequential year-fetches for wind) and can take tens of seconds.
- `POST /api/v1/simulate` — `{ inputs: LCOHInputs, profiles: { pv?, wind? } }`
  where each profile is an inline 8760 CF array or `{ lat, lon, kind }`
  resolved server-side. zod validates shape; the engine's `validateInputs`
  does deep numeric checks (`EngineInputError` → 400 with field path).
  Response includes sha256 profile hashes for `scenarios.profile_hashes`
  reproducibility.
- `GET /api/v1/defaults[?country=CL]` — country default packs.

Error envelope: `{ error: { code, message, details? } }`. Provider exhaustion
→ 502 with per-provider causes.

### Rate limiting

In-memory token bucket per client IP (`apps/web/lib/server/rateLimit.ts`):
resource-profiles 6/min sustained (burst 10) because cache misses hit free
upstream tiers; simulate/defaults 30/min. Per-instance only — swap for a
shared store before scaling horizontally. (Next 16 note: this lives in the
route handlers by design; `proxy.ts` explicitly discourages shared-state
logic.)

## Deferred

- Chilean 47-project parity screen — needs the source project dataset
  (not in the repo yet).
- `country_defaults` refresh ingest + CAPEX packs (rows are provisional
  Ember 2023).
- Air-density correction and PV tracking kinds in the crude fallback.
- CI drift check for `apps/web/lib/supabase/database.types.ts`.
