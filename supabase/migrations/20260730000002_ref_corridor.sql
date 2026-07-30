-- Green Corridor reference tables (build-plan Phase 0.4, applied in Phase 2).
-- Versioned + immutable: every row is keyed by (bundle_id, id); a data change
-- publishes a NEW bundle_id — rows are never updated (append-only).
-- SOURCE OF TRUTH: data/corridor-ref/<bundle_id>.json (keep in sync manually).

create table public.ref_bundles (
  bundle_id text primary key,
  schema_version int not null,
  source jsonb not null, -- { workbook, sha256, transcribedAt, note }
  created_at timestamptz not null default now()
);

comment on table public.ref_bundles is
  'Green Corridor reference-data bundle registry. Immutable/append-only; scenarios pin the bundle_id they were built with.';

create table public.ref_vessel_types (
  bundle_id text not null references public.ref_bundles (bundle_id),
  id text not null,
  label text not null,
  capex_usd_m numeric not null,
  opex_usd_m_per_year numeric not null,
  fuel_tonnes_per_year numeric not null,
  gj_per_nm numeric not null,
  verified boolean not null,
  source_note text not null,
  primary key (bundle_id, id)
);

create table public.ref_fuels (
  bundle_id text not null references public.ref_bundles (bundle_id),
  id text not null,
  label text not null,
  price_usd_per_tonne numeric not null,
  combustion_ef_tco2_per_tonne numeric not null,
  prod_capex_usd_m numeric not null,
  prod_opex_usd_m_per_year numeric not null,
  port_storage_capex_usd_m numeric not null,
  port_storage_opex_usd_m_per_year numeric not null,
  barge_capex_usd_m numeric not null,
  barge_opex_usd_m_per_year numeric not null,
  vessel_capex_premium numeric not null,
  lhv_mj_per_tonne numeric not null,
  wtw_gco2_per_mj numeric not null,
  verified boolean not null,
  source_note text not null,
  primary key (bundle_id, id)
);

create table public.ref_countries (
  bundle_id text not null references public.ref_bundles (bundle_id),
  id text not null,
  label text not null,
  wacc numeric not null,
  -- Workbook: "Illustrative country risk-premium benchmarks, not a verified
  -- source" — current values are NOT verified; the UI renders this as an
  -- explicit unverified-benchmark badge.
  verified boolean not null,
  source_note text not null,
  primary key (bundle_id, id)
);

create table public.ref_regulation_schedules (
  bundle_id text not null references public.ref_bundles (bundle_id),
  schedule_id text not null, -- 'etsPhaseIn' | 'fuelEuTargets'
  from_calendar_year int not null,
  value numeric not null,
  primary key (bundle_id, schedule_id, from_calendar_year)
);

-- Reference data is public read-only (like the existing reference tables);
-- writes go through the service role only.
alter table public.ref_bundles enable row level security;
alter table public.ref_vessel_types enable row level security;
alter table public.ref_fuels enable row level security;
alter table public.ref_countries enable row level security;
alter table public.ref_regulation_schedules enable row level security;

create policy "ref_bundles are publicly readable"
  on public.ref_bundles for select to anon, authenticated using (true);
create policy "ref_vessel_types are publicly readable"
  on public.ref_vessel_types for select to anon, authenticated using (true);
create policy "ref_fuels are publicly readable"
  on public.ref_fuels for select to anon, authenticated using (true);
create policy "ref_countries are publicly readable"
  on public.ref_countries for select to anon, authenticated using (true);
create policy "ref_regulation_schedules are publicly readable"
  on public.ref_regulation_schedules for select to anon, authenticated using (true);
