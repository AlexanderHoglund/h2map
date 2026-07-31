import { defineConfig } from "@playwright/test";

/**
 * Full-app e2e (build-plan 4.4). Runs against a fresh production server
 * (`next start` on :3100 — build first). The corridor golden path is fully
 * client-side and touches no backend, so dummy Supabase env suffices in CI.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  webServer: {
    // Always a fresh production server on its own port — never a (possibly
    // stale) dev server. Requires a prior `npm run build -w web`.
    command: "npm run start -w web -- -p 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
