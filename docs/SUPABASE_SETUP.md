# Supabase setup (manual, no Docker)

This repo authors the database schema as migrations in `supabase/migrations/`
but does **not** run a local Supabase stack. You provision two cloud projects
once, then apply migrations from the CLI (already installed as a repo
devDependency — every command below runs via `npx`).

## 1. Create the cloud projects

1. Sign in at [supabase.com/dashboard](https://supabase.com/dashboard) and create (or reuse) an organization.
2. Create project **`lcoh-dev`**:
   - Region: an EU region (e.g. **Frankfurt `eu-central-1`**) for latency/data-residency.
   - Generate a strong database password and save it in your password manager — the CLI asks for it when linking.
3. Repeat later for **`lcoh-prod`** (you only need dev to start; see §7).
4. Note each project's **ref** — the 20-character id in the dashboard URL, `https://supabase.com/dashboard/project/<ref>`.

## 2. Log in and link the dev project

From the repo root:

```powershell
npx supabase login              # opens the browser for an access token
npx supabase link --project-ref <dev-ref>
```

`link` asks for the database password from step 1.

## 3. Apply migrations

```powershell
npx supabase db push
```

This applies everything in `supabase/migrations/` (four tables: `resource_profiles`, `scenarios`, `country_defaults`, `turbine_curves`, plus RLS policies and the `get_scenario_by_share_token` RPC) and records migration history in the project. **Re-run `db push` after every new migration.** Never run manual SQL against prod outside migrations — migration history is the source of truth.

## 4. Seed reference data

`supabase/seed.sql` only auto-applies to *local* `db reset`, which we don't use. Apply it to the cloud project either way:

- **Dashboard:** SQL Editor → paste the contents of `supabase/seed.sql` → Run. It is idempotent (`on conflict do update`), safe to re-run.
- **Or psql** (connection string from Dashboard → Settings → Database):
  ```powershell
  psql "<connection-string>" -f supabase/seed.sql
  ```

Seeds: the `generic-5.6MW` turbine curve (mirror of `data/turbines/generic-5.6MW.json`) and provisional `country_defaults` for CL/SE/NL/NA/DE.

## 5. Generate TypeScript types

```powershell
npx supabase gen types typescript --linked > apps/web/lib/supabase/database.types.ts
```

Re-run after every migration. (A CI drift check is planned for Phase 2 when app code starts consuming these types.)

## 6. Environment variables

From Dashboard → Settings → API, copy into `apps/web/.env.local` (create it; never committed):

```
NEXT_PUBLIC_SUPABASE_URL=https://<dev-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>          # "publishable" sb_publishable_... on newer projects
SUPABASE_SECRET_KEY=<service_role key>            # "secret" sb_secret_... on newer projects
```

`.env.example` at the repo root documents the same names. The secret key is server-only: it must never get a `NEXT_PUBLIC_` prefix and is only read in server code (Phase 2 route handlers that write to the profile cache).

## 7. Production project

When ready to deploy: create `lcoh-prod` (same region), then:

```powershell
npx supabase link --project-ref <prod-ref>
npx supabase db push
```

and apply the seed as in §4. Longer-term, migrations merged to `main` should be pushed to prod by CI with a CI-scoped access token, not by hand. Re-link back to dev afterwards (`npx supabase link --project-ref <dev-ref>`) so day-to-day CLI work targets dev.

## 8. Connect the Supabase MCP server in Claude Code

The dev project's MCP server is already configured project-scope in `.mcp.json` (ref `vbsfniydnuovmhnlusms`, read-write). To authenticate, run in a regular terminal (not the IDE extension):

```powershell
claude /mcp
```

then select the `supabase` server → Authenticate, and complete the browser OAuth choosing the organization that contains the LCOH projects.

When `lcoh-prod` exists, add it **read-only** (never read-write in any MCP client):

```powershell
claude mcp add --scope project --transport http supabase-prod-ro "https://mcp.supabase.com/mcp?project_ref=<prod-ref>&read_only=true"
```

Schema changes made conversationally must still land as reviewed files in `supabase/migrations/`.

Supabase agent skills are installed in `.agents/skills/` (committed) with Claude Code symlinks in `.claude/skills/` (gitignored — absolute paths; regenerate on a new machine with `npx skills add supabase/agent-skills`).

## 9. Verification checklist

- [ ] Dashboard → Table Editor shows the four tables, each with the **RLS enabled** badge.
- [ ] `turbine_curves` has the `generic-5.6MW` row; `country_defaults` has 5 rows.
- [ ] SQL Editor as anon works: `select id from public.turbine_curves;` returns the row.
- [ ] Share RPC callable: `select id from public.get_scenario_by_share_token('no-such-token');` returns 0 rows (no error).
- [ ] Direct `select * from public.scenarios;` in the SQL editor returns 0 rows (RLS blocks; table empty anyway).
- [ ] `apps/web/lib/supabase/database.types.ts` exists after §5 and typechecks.

## 10. Auth configuration (login / access management build, 2026-08-03)

The `20260803000001_profiles.sql` migration adds the account layer:
`public.profiles` (display name/organisation + ADMIN-CONTROLLED
`account_type` / `access_expires_at` / `is_admin`), the `is_admin()` RLS
helper, and the signup trigger that auto-creates a profile row. Apply with
`npx supabase db push`, then regen types (§5) and re-run the advisors.

Dashboard settings the login flows require:

1. **Auth → Providers → Email**: keep **email confirmations ON**
   (recommended — auto-granted accounts still confirm their address first,
   which is the anti-bot line; turning it off gives instant access but
   invites spam signups).
2. **Auth → URL Configuration**: Site URL = the production origin.
   Additional redirect URLs: `http://localhost:3000/**` (dev),
   `http://127.0.0.1:3100/**` (the e2e prod server), and the prod `/**`.
3. **Auth → Email templates**: switch "Confirm signup" and "Reset password"
   to the token-hash form the server-side confirm route expects:
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}`
   (reset template: `type=recovery` and `next=/reset-password`).
4. **Custom SMTP before real users** — the built-in sender is limited to a
   couple of emails per hour and silently drops the rest; confirmation and
   reset mails will appear "lost" during testing without this.
5. **Settings → API → JWT keys**: enable **asymmetric JWT signing keys** so
   the proxy's `getClaims()` verifies sessions locally; on legacy HS256
   projects it falls back to a network call per navigation.
6. **Auth rate limits**: Supabase's built-in limits cover sign-in/sign-up
   attempts. Deliberately do NOT extend `apps/web/lib/server/rateLimit.ts`
   for auth — it is in-memory, per-instance, and resets on deploy.

### Applying the profiles migration

The CLI is not installed globally in this repo — always prefix with `npx`
(`supabase login` alone fails with "not recognized"). Two routes:

**A. CLI (preferred — records migration history).** `supabase link` needs a
personal ACCESS TOKEN, which is a different credential from the
`SUPABASE_SECRET_KEY` in `.env.local` (that one is the service key and
cannot run DDL). Create a token at
<https://supabase.com/dashboard/account/tokens>, then:

```powershell
npx supabase login --token <sbp_...>      # or: npx supabase login  (browser flow)
npx supabase link --project-ref vbsfniydnuovmhnlusms   # asks for the DB password
npx supabase db push
npx supabase gen types typescript --linked > apps/web/lib/supabase/database.types.ts
```

**B. Dashboard SQL editor (no token needed).** Paste the contents of
`supabase/migrations/20260803000001_profiles.sql` into the SQL editor and
run it. The migration is idempotent-safe to run once and includes the
backfill for pre-existing users. Then either run route A's `db push` later
(it will detect the objects already exist — reconcile with
`npx supabase migration repair --status applied 20260803000001`) or record
it manually so history stays truthful.

Until the migration is applied the app runs FAIL-OPEN: sign-in and page
gating work, but trial expiry is not enforced and `/admin` cannot load
(`lib/server/access.ts` and `getCallerWithAccess` log a warning and allow —
deliberately, so a missing migration or DB outage never bricks every page).

## Migration `20260811000001_project_starters.sql`

Adds the projects-first layer: `scenarios.view_mode` (the project's
Simplified/Standard level, checked enum, nullable) and
`profiles.projects_seeded_at` (the once-per-user seed flag for the Chilean
example project; server-set only — profiles keeps no authenticated write
policy). After applying, regenerate `apps/web/lib/supabase/database.types.ts`.

Until applied the app DEGRADES rather than breaking, with only a server-log
warning: the level falls back to the per-browser preference (not synced
across devices), the example's once-ever rule falls back to
seed-when-the-list-is-empty, and the seed route logs
`no seed flag, falling back to empty-list rule`. The
"Simple corridor (template)" project is ensured by NAME on every visit and
works with or without the migration. The seed route also needs
`SUPABASE_SECRET_KEY` (the service client stamps the profiles flag).

### First admin

Admin rights are held in `public.profiles.is_admin`, which no user can
self-write (no authenticated write policy). Bootstrap the first admin once,
in the SQL editor:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = '<your email>');
```

Every further grant can then be done from `/admin` in the app.

### Smoke test

```powershell
npm run auth:smoke   # against a running dev server on :3000
```

Creates two throwaway users via the service-role admin API (deleted at the
end), and verifies: the signup trigger + copied metadata, profiles RLS
(cross-read and self-promotion blocked), expired-trial 403s, the admin API
guard rails, scenario DELETE ownership, and the delete-user cascade. Checks
whose routes are not yet deployed report SKIP, so the script is useful from
the migration onward.
