-- Green Corridor reference seed — bundle 2026-07-30-excel-v1.
-- SOURCE OF TRUTH: data/corridor-ref/2026-07-30-excel-v1.json — keep in sync
-- manually (same convention as supabase/seed.sql ↔ data/turbines/).
-- Idempotent via ON CONFLICT DO NOTHING (append-only: reference rows are
-- never updated; a change is a new bundle_id).

insert into public.ref_bundles (bundle_id, schema_version, source) values (
  '2026-07-30-excel-v1',
  1,
  '{"workbook":"Green_Corridor_Model_Simplified_30_07.xlsx","sha256":"d3b219379402e211249ac336d98461fca98eb9c742dfde9498f03c045da38fbd","transcribedAt":"2026-07-30"}'::jsonb
) on conflict do nothing;

insert into public.ref_vessel_types
  (bundle_id, id, label, capex_usd_m, opex_usd_m_per_year, fuel_tonnes_per_year, gj_per_nm, verified, source_note)
values
  ('2026-07-30-excel-v1', 'tanker-35k',    'Tanker (35k dwt)',       20, 1.2,  2400,  4,   true, 'Data_tables!B6'),
  ('2026-07-30-excel-v1', 'tanker-80k',    'Tanker (80k dwt)',       35, 2,    5200,  7,   true, 'Data_tables!B7'),
  ('2026-07-30-excel-v1', 'bulk-60k',      'Bulk carrier (60k dwt)', 25, 1.5,  3000,  5,   true, 'Data_tables!B8'),
  ('2026-07-30-excel-v1', 'container-5k',  'Container (5k TEU)',     45, 2.8,  6500,  6,   true, 'Data_tables!B9'),
  ('2026-07-30-excel-v1', 'container-15k', 'Container (15k TEU)',    90, 5,    14000, 10,  true, 'Data_tables!B10'),
  ('2026-07-30-excel-v1', 'roro-ferry',    'Ro-Ro / Ferry',          30, 2,    3500,  4.5, true, 'Data_tables!B11')
on conflict do nothing;

insert into public.ref_fuels
  (bundle_id, id, label, price_usd_per_tonne, combustion_ef_tco2_per_tonne,
   prod_capex_usd_m, prod_opex_usd_m_per_year, port_storage_capex_usd_m,
   port_storage_opex_usd_m_per_year, barge_capex_usd_m, barge_opex_usd_m_per_year,
   vessel_capex_premium, lhv_mj_per_tonne, wtw_gco2_per_mj, verified, source_note)
values
  ('2026-07-30-excel-v1', 'lsfo',          'LSFO (conventional)', 594,  3.3,  0,  0,   0,  0,   0,   0,    0,    40200,  92.4, true, 'Data_tables!B15'),
  ('2026-07-30-excel-v1', 'lng',           'LNG',                 550,  2.75, 15, 1,   8,  0.3, 3,   0.1,  0.1,  48000,  84,   true, 'Data_tables!B16'),
  ('2026-07-30-excel-v1', 'e-ammonia',     'e-Ammonia',           900,  0.1,  55, 3,   12, 0.5, 5,   0.3,  0.25, 18600,  15,   true, 'Data_tables!B17'),
  ('2026-07-30-excel-v1', 'e-methanol',    'e-Methanol',          850,  0.2,  45, 2.5, 8,  0.4, 4,   0.2,  0.15, 19900,  15,   true, 'Data_tables!B18'),
  ('2026-07-30-excel-v1', 'biodiesel-hvo', 'Biodiesel / HVO',     1100, 0.3,  5,  0.5, 1,  0.1, 0.5, 0.05, 0.05, 44000,  25,   true, 'Data_tables!B19'),
  ('2026-07-30-excel-v1', 'lh2',           'Hydrogen (liquid)',   1200, 0,    80, 4,   20, 0.8, 8,   0.4,  0.3,  120000, 10,   true, 'Data_tables!B20')
on conflict do nothing;

insert into public.ref_countries (bundle_id, id, label, wacc, verified, source_note)
values
  ('2026-07-30-excel-v1', 'denmark',       'Denmark',              0.055, false, 'Illustrative country risk-premium benchmarks, not a verified source (Data_tables!B33)'),
  ('2026-07-30-excel-v1', 'netherlands',   'Netherlands',          0.055, false, 'Illustrative country risk-premium benchmarks, not a verified source (Data_tables!B33)'),
  ('2026-07-30-excel-v1', 'india',         'India',                0.095, false, 'Illustrative country risk-premium benchmarks, not a verified source (Data_tables!B33)'),
  ('2026-07-30-excel-v1', 'brazil',        'Brazil',               0.115, false, 'Illustrative country risk-premium benchmarks, not a verified source (Data_tables!B33)'),
  ('2026-07-30-excel-v1', 'singapore',     'Singapore',            0.06,  false, 'Illustrative country risk-premium benchmarks, not a verified source (Data_tables!B33)'),
  ('2026-07-30-excel-v1', 'united-states', 'United States',        0.07,  false, 'Illustrative country risk-premium benchmarks, not a verified source (Data_tables!B33)'),
  ('2026-07-30-excel-v1', 'other',         'Other (edit manually)', 0.08, false, 'Illustrative country risk-premium benchmarks, not a verified source (Data_tables!B33)')
on conflict do nothing;

insert into public.ref_regulation_schedules (bundle_id, schedule_id, from_calendar_year, value)
values
  ('2026-07-30-excel-v1', 'etsPhaseIn',    2024, 0.4),
  ('2026-07-30-excel-v1', 'etsPhaseIn',    2025, 0.7),
  ('2026-07-30-excel-v1', 'etsPhaseIn',    2026, 1.0),
  ('2026-07-30-excel-v1', 'fuelEuTargets', 2025, 0.02),
  ('2026-07-30-excel-v1', 'fuelEuTargets', 2030, 0.06),
  ('2026-07-30-excel-v1', 'fuelEuTargets', 2035, 0.145),
  ('2026-07-30-excel-v1', 'fuelEuTargets', 2040, 0.31),
  ('2026-07-30-excel-v1', 'fuelEuTargets', 2045, 0.62),
  ('2026-07-30-excel-v1', 'fuelEuTargets', 2050, 0.8)
on conflict do nothing;
