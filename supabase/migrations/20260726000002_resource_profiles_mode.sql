-- Profile MODE discriminator (activation of P0 #1/#2/#4). The resource cache
-- already stores multiple dataset_versions per (lat_r, lon_r, kind), but get()
-- returns the most-recent regardless of version. To let the MAP serve improved
-- profiles (air-density corrected wind, IEC turbine class, unified PVGIS-ERA5)
-- while the Chilean PARITY run keeps the reference profiles it validates
-- against, tag each row with the mode it was built in and filter on it.
--
-- Existing rows are all reference (that is how everything has been seeded), so
-- the default backfills them correctly. Additive + nullable-with-default →
-- the currently deployed profile-service keeps writing valid rows.
alter table public.resource_profiles
  add column if not exists mode text not null default 'reference'
    check (mode in ('reference', 'improved'));

comment on column public.resource_profiles.mode is
  'reference = doc-literal profiles (parity baseline); improved = P0 #1/#2/#4 corrected profiles the live map serves. get() filters on this so both coexist per coordinate.';

create index if not exists resource_profiles_mode_idx
  on public.resource_profiles (lat_r, lon_r, kind, mode);
