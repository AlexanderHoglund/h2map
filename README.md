# Global LCOH Explorer (H2MAP)

Worldwide Levelized Cost of Hydrogen calculator — pick any point on Earth, configure a project, get LCOH (USD/kg H₂) with full cost decomposition.

Re-implements the published methodology of the Chilean **"Motor de Cálculo LCOH — Principales Características"** (Ministerio de Energía de Chile / Centro de Energía FCFM / USACH / PUC, April 2024), extended to global coverage via open resource-data APIs.

> Work in progress — this session: monorepo foundations + calculation engine (Phase 0 + 1).

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

## Attribution

(filled in at end of session)
