# Global LCOH Explorer (H2MAP)

Worldwide Levelized Cost of Hydrogen calculator — pick any point on Earth, configure a project, get LCOH (USD/kg H₂) with full cost decomposition.

Re-implements the published methodology of the Chilean **"Motor de Cálculo LCOH — Principales Características"** (Ministerio de Energía de Chile / Centro de Energía FCFM / USACH / PUC, April 2024), extended to global coverage via open resource-data APIs.

> Status: Phase 0 (foundations) + Phase 1 (engine) complete. The engine is
> fully implemented and validated (43 tests: closed-form analytical cases,
> property tests, golden-file regression at 1e-12, < 50 ms perf budget).
> Next: Phase 2 — resource-profile service, provider fallback chain, and the
> public `/api/v1/simulate` endpoint.

## Structure

```
apps/web              Next.js App Router application
packages/lcoh-engine  Pure-TypeScript LCOH engine (zero deps, fully tested)
scripts/providers     Resource-data provider spike scripts
data/                 Turbine curves, spike outputs
supabase/             Migrations + seed (applied manually — see docs/SUPABASE_SETUP.md)
docs/                 Setup guides and engine methodology notes
```

## Commands

```
npm install           # once, at root (npm workspaces)
npm run typecheck     # all workspaces
npm run lint
npm run test          # engine validation battery (vitest)
npm run dev           # Next.js dev server
npm run spike:fetch   # pull provider data for the 5 test sites
npm run spike:compare # provider comparison table
```

## Setup

1. `npm install` at the repo root.
2. Supabase (optional until Phase 2): follow [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) to provision the cloud projects and apply `supabase/migrations/`.
3. Engine methodology decisions and reference-mode flags are documented in [docs/ENGINE_NOTES.md](docs/ENGINE_NOTES.md).

## Methodology & attribution

- **Methodology:** re-implementation of the published method in *"Motor de Cálculo LCOH — Principales Características"*, Ministerio de Energía de Chile / Centro de Energía FCFM / USACH / PUC, April 2024. This project is independent of and not endorsed by its authors; deviations from the reference method are opt-in flags documented in `docs/ENGINE_NOTES.md`.
- **Weather data by [Open-Meteo.com](https://open-meteo.com/)** (CC BY 4.0), based on ERA5 (Copernicus Climate Change Service). Free tier, non-commercial use.
- **PVGIS** © European Commission, Joint Research Centre — [PVGIS online tool](https://re.jrc.ec.europa.eu/pvg_tools/).
- **NASA POWER:** data obtained from the NASA Langley Research Center POWER Project, funded through the NASA Earth Science Directorate Applied Science Program.
- Turbine power curve: digitized generic approximation of a modern 5.6 MW class turbine (`data/turbines/generic-5.6MW.json`) — defines profile shape only.
- Provisional grid emission factors: Ember Yearly Electricity Data.

All resource-data attributions must also be carried by the future UI footer and API `meta.attribution` field (Phase 2+).
