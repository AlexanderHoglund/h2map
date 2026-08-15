-- Enriched country profiles: curated cost/finance inputs alongside the
-- automated heuristics.
--
-- Until now a country contributed exactly two numbers to the model — a WACC
-- guessed from its World Bank income group, and a grid emission factor from
-- OWID/Ember — both written by a scheduled ingest that runs every three
-- hours. That ingest has no concept of curation: it rewrites `source`
-- unconditionally, and its only "preservation" was reading an existing
-- WACC back and re-writing it, which freezes a heuristic on first run and
-- makes it indistinguishable from a hand-researched value.
--
-- So the discriminator comes first: `curated` is what lets the ingest know
-- to keep its hands off. Every enriched field is NULLABLE, and a null means
-- "no curated value — fall back to the heuristic/model default for this
-- field". A country is never all-or-nothing: it can carry a researched WACC
-- and leave water pricing to the default.
alter table public.country_defaults
  add column if not exists curated boolean not null default false,
  -- Cost & finance inputs: the fields that actually move an LCOH.
  add column if not exists wacc_curated numeric,
  add column if not exists country_risk_premium numeric,
  add column if not exists electricity_price_usd_mwh numeric,
  add column if not exists water_price_usd_m3 numeric,
  add column if not exists land_cost_usd_ha numeric,
  add column if not exists labour_index numeric,
  -- Per-field provenance for the curated values ONLY, kept separate from
  -- the ingest-owned `source` text so the automated refresh and the
  -- research record can never overwrite one another. Shape:
  --   { "<field>": { "value": <n>, "source": "...", "retrievedAt": "YYYY-MM-DD",
  --                  "verified": true|false, "note": "..." } }
  -- `verified: false` means usable but unconfirmed — the UI shows it as
  -- unverified, the same discipline the fuel-emissions dataset uses.
  add column if not exists profile_source jsonb,
  add column if not exists profile_version text,
  add column if not exists profile_updated_at timestamptz;

comment on column public.country_defaults.curated is
  'True when a researched profile owns this row. The scheduled ingest then writes only fields the profile leaves null, and never touches source/profile_source.';
comment on column public.country_defaults.wacc_curated is
  'Researched cost of capital. Preferred over wacc_suggestion (the income-group heuristic) wherever present.';
comment on column public.country_defaults.electricity_price_usd_mwh is
  'Industrial / PPA electricity price, USD per MWh — the grid-import price for a plant that is not fully islanded.';
comment on column public.country_defaults.profile_source is
  'Per-field provenance for curated values: {field: {value, source, retrievedAt, verified, note}}. Separate from `source`, which the automated ingest owns and overwrites.';

-- `capex_pack jsonb` already existed but was never written by anything.
-- It is claimed by this work as the per-technology CAPEX overrides slot.
comment on column public.country_defaults.capex_pack is
  'Curated per-technology CAPEX overrides, e.g. {"solarUsdPerKw": 750, "windUsdPerKw": 1400}. Null = use the global reference pack.';
