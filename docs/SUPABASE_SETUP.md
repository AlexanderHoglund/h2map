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
