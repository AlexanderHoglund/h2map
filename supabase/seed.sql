-- Seed reference data.
--
-- NOTE: `supabase db reset` applies seed.sql automatically ONLY for a local
-- Docker stack, which this repo does not use. Apply this file to a cloud
-- project by pasting it into the SQL Editor or via
--   psql "$SUPABASE_DB_URL" -f supabase/seed.sql
-- (see docs/SUPABASE_SETUP.md). Idempotent via ON CONFLICT.

-- Generic 5.6 MW turbine curve.
-- SOURCE OF TRUTH: data/turbines/generic-5.6MW.json — keep in sync manually
-- (or regenerate this INSERT from the JSON when the curve changes).
insert into public.turbine_curves (id, rated_kw, hub_heights, speeds, power_kw, source)
values (
  'generic-5.6MW',
  5600,
  array[120, 160],
  array[3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0, 10.5, 11.0, 11.5, 12.0, 12.5, 13.0, 14.0, 15.0, 16.0, 17.0, 18.0, 19.0, 20.0, 21.0, 22.0, 23.0, 24.0, 25.0]::real[],
  array[50, 120, 240, 400, 610, 870, 1180, 1540, 1960, 2440, 2970, 3540, 4110, 4640, 5070, 5370, 5530, 5590, 5600, 5600, 5600, 5600, 5600, 5600, 5600, 5600, 5600, 5600, 5600, 5600, 5600, 5600, 5600]::real[],
  'Digitized approximation of a modern 5.6 MW class onshore turbine (V162-5.6 shape). Defines profile shape only; capacity scales linearly. Mirror of data/turbines/generic-5.6MW.json.'
)
on conflict (id) do update set
  rated_kw = excluded.rated_kw,
  hub_heights = excluded.hub_heights,
  speeds = excluded.speeds,
  power_kw = excluded.power_kw,
  source = excluded.source;

-- Provisional country defaults for the five spike regions + Germany.
-- Grid emission factors: Ember Yearly Electricity Data (2023 values,
-- tCO2e/MWh generation-based). PROVISIONAL — refresh in Phase 2 when the
-- /defaults endpoint is built and a proper ingest exists.
insert into public.country_defaults (iso2, grid_ef_tco2_mwh, wacc_suggestion, capex_pack, source)
values
  ('CL', 0.33, 0.080, null, 'Ember Yearly Electricity Data 2023 (provisional)'),
  ('SE', 0.02, 0.070, null, 'Ember Yearly Electricity Data 2023 (provisional)'),
  ('NL', 0.33, 0.070, null, 'Ember Yearly Electricity Data 2023 (provisional)'),
  ('NA', 0.06, 0.095, null, 'Ember Yearly Electricity Data 2023 (provisional)'),
  ('DE', 0.38, 0.070, null, 'Ember Yearly Electricity Data 2023 (provisional)')
on conflict (iso2) do update set
  grid_ef_tco2_mwh = excluded.grid_ef_tco2_mwh,
  wacc_suggestion = excluded.wacc_suggestion,
  source = excluded.source,
  updated_at = now();
