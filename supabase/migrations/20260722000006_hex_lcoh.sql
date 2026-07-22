-- Precomputed LCOH per H3 cell for the Explorer choropleth. Computed by
-- scripts/hex/seed-hexes.ts with the doc-literal reference configuration
-- (100 MW electrolyzer, LCOE-priced renewables, best PV/wind mix of a
-- 200 MW total). Ocean cells are never inserted — absence means "do not
-- draw". status='computing' rows are placeholders the seeder claims before
-- the (slow) profile build; the client renders the parent cell's value at
-- reduced opacity until they flip to 'ready'.
create table public.hex_lcoh (
  h3 text primary key check (h3 ~ '^[0-9a-f]{15}$'),
  res int not null check (res between 0 and 6),
  lat numeric(7,4) not null,
  lon numeric(7,4) not null,
  status text not null default 'computing'
    check (status in ('computing', 'ready', 'failed')),
  lcoh_best real,
  lcoh_solar real,
  lcoh_wind real,
  best_pv_mw real,
  best_wind_mw real,
  solar_cf real,
  wind_cf real,
  engine_version text,
  computed_at timestamptz not null default now()
);

create index hex_lcoh_res_idx on public.hex_lcoh (res);

comment on table public.hex_lcoh is
  'Precomputed reference-configuration LCOH per H3 cell (Explorer choropleth). Absent = ocean/unseeded.';

alter table public.hex_lcoh enable row level security;

create policy "hex_lcoh is publicly readable"
  on public.hex_lcoh
  for select
  to anon, authenticated
  using (true);

-- Batch lookup by id list. An RPC (POST body) because thousands of ids do
-- not fit in a PostgREST `in.()` query string. security invoker: RLS above
-- still applies.
create or replace function public.get_hex_cells(p_ids text[])
returns setof public.hex_lcoh
language sql
stable
set search_path = ''
as $$
  select * from public.hex_lcoh where h3 = any (p_ids);
$$;

grant execute on function public.get_hex_cells(text[]) to anon, authenticated;
