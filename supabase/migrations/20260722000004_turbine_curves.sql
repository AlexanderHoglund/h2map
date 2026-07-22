-- Digitized turbine power curves. Per the source methodology the turbine
-- defines the profile SHAPE only; installed capacity scales linearly.
-- Reference data: publicly readable, maintained via migrations/seeds only.
create table public.turbine_curves (
  id text primary key,
  rated_kw int not null,
  hub_heights int[] not null,
  speeds real[] not null,
  power_kw real[] not null,
  source text
);

comment on table public.turbine_curves is
  'Digitized turbine power curves (speeds m/s -> power kW). Source of truth for the generic curve: data/turbines/generic-5.6MW.json.';

alter table public.turbine_curves enable row level security;

create policy "turbine_curves are publicly readable"
  on public.turbine_curves
  for select
  to anon, authenticated
  using (true);
