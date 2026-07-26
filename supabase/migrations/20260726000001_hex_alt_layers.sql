-- Optional map layers (P1 #5 risk-adjusted WACC, P1 #6 best-achievable sizing).
-- The base lcoh_best / lcoh_years columns remain the DEFAULT layers
-- (resource-driven, uniform 8% financing, fixed 2:1 sizing); these two jsonb
-- columns hold the toggleable alternatives per cost year. Populated by the
-- recompute pass (not the per-cell seeder, which stays fast); null until a
-- recompute has run for a cell.
alter table public.hex_lcoh add column if not exists lcoh_wacc jsonb;
alter table public.hex_lcoh add column if not exists lcoh_optimal jsonb;

comment on column public.hex_lcoh.lcoh_wacc is
  'P1 #5 risk-adjusted best LCOH under the cell country cost of capital, per cost year: {"2024":n,"2030":n,"2040":n,"2050":n}. Uniform-8% default lives in lcoh_best/lcoh_years.';
comment on column public.hex_lcoh.lcoh_optimal is
  'P1 #6 best-achievable LCOH over the oversizing+mix grid, per cost year: {"2024":{"best":n,"ratio":n,"pvShare":n},...}. Fixed-2:1 default lives in lcoh_best/lcoh_years.';
