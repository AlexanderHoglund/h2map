-- Region-aware default parameter packs: grid emission factor, WACC
-- suggestion, CAPEX trajectories by technology/year. Reference data:
-- publicly readable, maintained via migrations/seeds only.
create table public.country_defaults (
  iso2 text primary key check (char_length(iso2) = 2),
  grid_ef_tco2_mwh numeric,
  wacc_suggestion numeric,
  capex_pack jsonb,
  source text,
  updated_at timestamptz not null default now()
);

comment on table public.country_defaults is
  'Per-country default parameters (grid emission factor tCO2/MWh, WACC suggestion, CAPEX pack by tech/year).';

alter table public.country_defaults enable row level security;

create policy "country_defaults are publicly readable"
  on public.country_defaults
  for select
  to anon, authenticated
  using (true);
