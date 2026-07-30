# Staged migrations — NOT applied

SQL authored ahead of its phase. Files here are **deliberately outside**
`supabase/migrations/` so no `supabase db push` (or the Phase-2 work of
someone else) applies them by accident.

- `ref_corridor.sql` + `ref_corridor_seed.sql` — Green Corridor reference
  tables + seed (Phase 0.4 artifact). **Phase 2** moves them into
  `supabase/migrations/` with a fresh timestamp and applies them.
- Source of truth for the seed data is `data/corridor-ref/<bundleId>.json`
  (the app reads the JSON bundle; the tables mirror it for querying/RLS).
  Keep them in sync manually, like `supabase/seed.sql` ↔ `data/turbines/`.

Phase-2 reminders (from the build plan + repo reality):

- The repo already has `public.scenarios` (owner/inputs/results/share_token,
  RLS, share-token RPC — migration `20260722000002`). The corridor scenarios
  design must **EXTEND that table** (add `schema_version`, `engine_version`,
  `ref_bundle_version` columns), not recreate it.
- Reference data is append-only: a data change is a NEW bundle_id inserted
  alongside, never an UPDATE of existing rows.
