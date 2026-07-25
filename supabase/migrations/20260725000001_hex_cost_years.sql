-- Per-cost-year LCOH for the Explorer's 2030/2040/2050 buttons. The existing
-- lcoh_best/solar/wind columns hold the current (2024) values; this jsonb
-- holds the future years as { "2030": {"best":n,"solar":n,"wind":n}, ... }.
-- Written by the seeder / recompute (mapSweepAllYears); IEA-anchored packs.
alter table public.hex_lcoh add column if not exists lcoh_years jsonb;

comment on column public.hex_lcoh.lcoh_years is
  'Future cost-year LCOH: {"2030":{best,solar,wind},"2040":{...},"2050":{...}}. 2024 lives in the lcoh_* columns.';
