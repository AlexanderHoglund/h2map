-- Add `mode` to the resource-profile unique key.
--
-- The PV-pathway correctness fix removes the PVGIS-ERA5 pin from improved mode.
-- Improved-mode PV now auto-resolves to the SAME radiation DB (SARAH3/NSRDB) as
-- reference-mode PV, so both build the SAME dataset_version (e.g.
-- pvgis-sarah3/tmy-v1). The original unique key (lat_r, lon_r, kind,
-- dataset_version) therefore collapses the two modes onto a single row: the
-- calculator's reference PV (which still falls back to the crude Open-Meteo
-- proxy) and the map's masked improved PV fight over one row via upsert, and
-- whichever writes last flips the row's mode — dropping the other mode's read to
-- a cache miss. get() already filters on mode, so the key must include it too.
--
-- Widening the key can only ADD permissible rows (the old 4-col uniqueness
-- implies the new 5-col uniqueness), so no existing row can violate it.
alter table public.resource_profiles
  drop constraint if exists resource_profiles_lat_r_lon_r_kind_dataset_version_key;

alter table public.resource_profiles
  add constraint resource_profiles_lat_r_lon_r_kind_mode_dataset_version_key
    unique (lat_r, lon_r, kind, mode, dataset_version);
