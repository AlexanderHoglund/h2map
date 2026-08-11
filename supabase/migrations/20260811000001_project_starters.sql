-- Projects-first UX (2026-08-11): per-project view mode + once-per-user
-- starter seeding.
--
-- view_mode: the project's Simplified/Standard state. Nullable — legacy rows
-- fall back to the browser preference. Deliberately a COLUMN, not a key in
-- inputs: the scenario payload must stay view-mode-free (output neutrality —
-- two people opening the same scenario in different modes see the same
-- numbers; e2e-pinned).
alter table public.scenarios
  add column if not exists view_mode text
    check (view_mode in ('simplified', 'standard'));

-- Once-per-user-ever seed flag: the seed route stamps it atomically
-- (update ... where projects_seeded_at is null) with the service client
-- before inserting the two starter projects. profiles keeps NO authenticated
-- write policy (auth design, 20260803000001) — the flag is server-set only.
alter table public.profiles
  add column if not exists projects_seeded_at timestamptz;
