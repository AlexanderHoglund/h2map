-- Per-user account profile (login/access-management build, 2026-08-03).
--
-- account_type / is_admin / access_expires_at are ADMIN-CONTROLLED
-- authorization data: they live here under RLS, NEVER in user_metadata
-- (user-editable) and are never trusted from the JWT. The signup trigger
-- copies only DISPLAY fields (name / organisation) from metadata.
--
-- Access model:
--   * request-access self-signup -> auto-granted 'full' (the column defaults)
--   * 'trial' / 'teaching' accounts are created by admins and carry
--     access_expires_at; access is allowed iff
--     access_expires_at is null or access_expires_at > now()
--   * expiry is enforced in the app layer (requireAccess() on gated pages,
--     getCallerWithAccess() in API routes) - not in scenario RLS, so an
--     expired user's data is preserved and an admin extension restores
--     access with no data motion.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  organisation text not null default '',
  account_type text not null default 'full'
    check (account_type in ('full', 'trial', 'teaching')),
  -- null = never expires
  access_expires_at timestamptz,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Per-user account data. Authorization columns are service-role-managed; no authenticated write policy exists by design.';

-- Reuse the hardened (search_path-pinned) trigger function from 20260722000005.
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- SECURITY DEFINER to break RLS recursion (an "admins read all" policy that
-- itself selected profiles would recurse). The body checks auth.uid() only,
-- so granting execute broadly is safe: it answers only "is the CALLER an
-- admin", never "is user X an admin".
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

create policy "users read their own profile"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "admins read all profiles"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

-- NO insert/update/delete policies for authenticated: inserts happen via the
-- signup trigger below (definer), updates/deletes only via the service-role
-- admin API. Nobody can self-promote account_type / is_admin / expiry.

-- Auto-create a profile on signup, copying DISPLAY data (not authz data).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, organisation)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'organisation', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
