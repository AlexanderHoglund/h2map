-- Green Corridor Phase 2.1 — EXTEND public.scenarios (per the build plan and
-- staged README: the table, its RLS and its share-token RPC already exist for
-- LCOH scenarios and must not be recreated).
--
-- Corridor rows are discriminated by `kind` and pin the three versions the
-- build plan requires (schemaVersion / engineVersion / refBundleVersion) so a
-- saved scenario can be loaded against newer code/data with an explicit
-- "recompute?" affordance, never a silent swap. Column semantics for
-- kind='corridor': inputs = ScenarioInput payload, results = ScenarioResult.
-- Existing LCOH rows are untouched (kind defaults to 'lcoh', versions null).

alter table public.scenarios
  add column if not exists kind text not null default 'lcoh'
    check (kind in ('lcoh', 'corridor')),
  add column if not exists schema_version int,
  add column if not exists engine_version text,
  add column if not exists ref_bundle_version text;

comment on column public.scenarios.kind is
  'Discriminator: lcoh (calculator scenarios, original schema) or corridor (Green Corridor: inputs=ScenarioInput, results=ScenarioResult, versions pinned).';
comment on column public.scenarios.schema_version is
  'Corridor: ScenarioInput schemaVersion the payload was written with.';
comment on column public.scenarios.engine_version is
  'Corridor: @h2map/corridor-engine version that produced results.';
comment on column public.scenarios.ref_bundle_version is
  'Corridor: reference bundle id (data/corridor-ref/<id>.json) the scenario pins.';

create index if not exists scenarios_owner_kind_idx
  on public.scenarios (owner, kind);
