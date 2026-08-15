import { defineConfig } from "vitest/config";

/**
 * `scripts/` is not an npm workspace (it is a folder of tsx entry points),
 * so `npm test --workspaces` never reached it and none of this code had a
 * test. Pure logic extracted from those scripts — the country-defaults
 * curation rule is the first — is tested here, wired into the root `test`
 * script.
 */
export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    root: import.meta.dirname,
  },
});
