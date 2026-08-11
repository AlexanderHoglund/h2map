import { defineConfig } from "@playwright/test";

/**
 * Full-app e2e. Runs against a fresh production server (`next start` on
 * :3100 — build first). The app is AUTH-GATED (login build): global-setup
 * mints throwaway users against the LIVE dev Supabase project (real
 * apps/web/.env.local required — dummy env no longer suffices) and saves
 * signed-in storageState; global-teardown deletes them.
 *
 * Projects:
 *  - authed: default for every spec (signed-in cookie session)
 *  - anon:   specs matching *.anon.spec.ts (gating/redirect checks)
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "authed",
      testIgnore: /.*\.anon\.spec\.ts/,
      use: { storageState: "e2e/.auth/user.json" },
    },
    {
      name: "anon",
      testMatch: /.*\.anon\.spec\.ts/,
    },
  ],
  webServer: {
    // Always a fresh production server on its own port — never a (possibly
    // stale) dev server. Requires a prior `npm run build -w web`.
    command: "npm run start -w web -- -p 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    // All workers share one IP — widen the per-IP buckets so parallel spec
    // files don't turn into intermittent 429s (production is untouched).
    env: { ...process.env, RATE_LIMIT_SCALE: "10" },
  },
});
