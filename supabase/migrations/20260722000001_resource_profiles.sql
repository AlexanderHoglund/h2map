-- Cached hourly resource profiles (TMY capacity factors) keyed by rounded
-- coordinates + configuration + dataset version. Written exclusively by the
-- Next.js server with the service-role key; publicly readable.
create table public.resource_profiles (
  id uuid primary key default gen_random_uuid(),
  lat_r numeric(7,4) not null,
  lon_r numeric(7,4) not null,
  kind text not null check (kind in ('pv_fixed','pv_1axis','pv_2axis','wind_120','wind_160')),
  dataset_version text not null,
  provider text not null,
  -- NOTE: int4range renders as `unknown` in generated TypeScript types;
  -- cast in queries or wrap in a view if that becomes annoying.
  years int4range,
  cf real[] not null,
  created_at timestamptz not null default now(),
  unique (lat_r, lon_r, kind, dataset_version)
);

comment on table public.resource_profiles is
  'Cached 8760-value hourly capacity-factor profiles per rounded coordinate/config/dataset.';
comment on column public.resource_profiles.cf is
  'Exactly 8760 hourly capacity factors in [0,1] (kWh per kW installed).';

alter table public.resource_profiles enable row level security;

-- Public read; NO insert/update/delete policies: cache writes go through the
-- server-side service role, which bypasses RLS.
create policy "resource_profiles are publicly readable"
  on public.resource_profiles
  for select
  to anon, authenticated
  using (true);
