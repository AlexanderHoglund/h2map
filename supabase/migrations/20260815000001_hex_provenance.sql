-- Per-cell data provenance on the LCOH map.
--
-- Two tiers a viewer cannot otherwise see, and which mean different things:
--
--   pv_db_tier    'satellite' | 'era5'
--     Which PVGIS radiation database served the cell. PVGIS v5_3 offers only
--     SARAH3 (inside the Meteosat disc) and ERA5; NSRDB was dropped from the
--     API. So ERA5 is not a degraded fallback outside that disc, it is the
--     only option — and measured against SARAH3 where both exist it lands
--     within a few percent, in either direction. Recorded for transparency,
--     not as a quality flag.
--
--   wind_fidelity 'improved' | 'fallback'
--     'improved' = Open-Meteo with air-density correction and IEC turbine
--     class selection. 'fallback' = NASA POWER: generic curve, fixed 1/7
--     shear, neither correction. This IS a modelling difference, and
--     adjacent cells computed by different models are a seam the map must
--     not hide (the same reason PV renders no-data rather than mixing in a
--     crude proxy).
--
-- Written by the recompute-family passes (recompute / reseed-improved /
-- recover-solar), which already hold the resolved profiles. Null until a
-- cell has been through one of them. get_hex_cells is `select *`, so the
-- RPC needs no change.
alter table public.hex_lcoh
  add column if not exists pv_db_tier text
    check (pv_db_tier in ('satellite', 'era5')),
  add column if not exists wind_fidelity text
    check (wind_fidelity in ('improved', 'fallback'));

comment on column public.hex_lcoh.pv_db_tier is
  'Which PVGIS radiation database served this cell: satellite (SARAH3) or era5. Transparency, not a quality ranking — ERA5 is the only option outside the Meteosat disc.';
comment on column public.hex_lcoh.wind_fidelity is
  'improved = Open-Meteo (air density + IEC class); fallback = NASA POWER generic curve. A real modelling difference, rendered distinguishably.';
