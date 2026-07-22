-- User-saved scenarios. Owner-only via RLS; sharing happens through a
-- security-definer RPC keyed on an unguessable token, NOT an open SELECT
-- policy (an open `share_token is not null` policy would let anyone
-- enumerate every shared scenario).
create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  owner uuid references auth.users (id) on delete cascade,
  name text not null,
  inputs jsonb not null,
  results jsonb,
  profile_hashes jsonb,
  share_token text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.scenarios is
  'Saved LCOH scenarios: inputs (LCOHInputs), last results + engine version, profile hashes for reproducibility.';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger scenarios_set_updated_at
  before update on public.scenarios
  for each row
  execute function public.set_updated_at();

alter table public.scenarios enable row level security;

create policy "owners have full access to their scenarios"
  on public.scenarios
  for all
  to authenticated
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

-- Share-link read: requires knowing the exact token.
create or replace function public.get_scenario_by_share_token(p_token text)
returns setof public.scenarios
language sql
security definer
set search_path = public
stable
as $$
  select *
  from public.scenarios
  where share_token = p_token
    and share_token is not null;
$$;

comment on function public.get_scenario_by_share_token(text) is
  'Read a shared scenario by its unlisted token. security definer so anon can read without an open SELECT policy.';

grant execute on function public.get_scenario_by_share_token(text) to anon, authenticated;
