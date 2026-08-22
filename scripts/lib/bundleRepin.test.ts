import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROOT } from "./serviceDeps";

/**
 * A saved project must open, whatever bundle it was saved against.
 *
 * The browser ships exactly ONE reference bundle, so a project pinned to an
 * older id hits `resolveScenario`'s guard and refuses to load:
 *
 *   scenario pins bundle "2026-08-17-vessel-v3" but got "2026-08-18-fuel-v4"
 *
 * That is what a user saw after the fuel re-base: every existing project
 * became unopenable. `repinToCurrentBundle` moves a stored scenario onto the
 * shipped bundle, and every app load path has to call it — a path that
 * forgets is a project that cannot be opened, which no type or test would
 * otherwise catch.
 *
 * Asserted against source rather than behaviour: this is a wiring property
 * across three files, the web workspace has no test runner, and standing up
 * a browser harness for one invariant would cost more than it is worth.
 */

const read = (p: string) => readFileSync(`${ROOT}${p}`, "utf8");
const state = read("apps/web/components/corridor/state.ts");
const projects = read("apps/web/components/corridor/useProjects.ts");

describe("stored scenarios are re-pinned to the shipped bundle", () => {
  it("the helper exists and keys off the shipped bundle, not a literal", () => {
    // A hardcoded id would go stale on the next bundle and silently stop
    // re-pinning the one case it exists for.
    expect(state).toMatch(/export function repinToCurrentBundle/);
    expect(state).toMatch(/DEFAULT_BUNDLE\.bundleId/);
  });

  it("every migrateScenarioInput call in the app is re-pinned", () => {
    // THE REGRESSION GUARD. Each of these is a way a scenario enters the
    // workspace: the localStorage draft, an imported JSON payload, and a
    // project row from the database. All three must re-pin.
    for (const [name, src] of [
      ["state.ts", state],
      ["useProjects.ts", projects],
    ] as const) {
      const calls = src.match(/migrateScenarioInput\(/g) ?? [];
      expect(calls.length, `${name} should still load scenarios`).toBeGreaterThan(0);
      // Every call site must have a re-pin somewhere in the same file.
      expect(src, `${name} migrates without re-pinning`).toMatch(
        /repinToCurrentBundle/,
      );
    }
  });

  it("re-pins on the three load paths by name", () => {
    // Named individually so removing one is a failure rather than a silent
    // drop to "some other call site still re-pins".
    expect(state, "localStorage draft").toMatch(
      /localStorage\.getItem\(DRAFT_KEY\)[\s\S]{0,400}repinToCurrentBundle/,
    );
    // load() re-pins into a local before setScenario/setLoaded (the
    // plausibility baseline needs the same re-pinned value twice).
    expect(state, "imported payload").toMatch(
      /repinToCurrentBundle\(migrateScenarioInput\(payload\)[\s\S]{0,160}setScenario\(next\)/,
    );
    expect(projects, "saved project row").toMatch(
      /migrateScenarioInput\(row\.inputs\)[\s\S]{0,400}repinToCurrentBundle/,
    );
  });

  it("does NOT re-pin inside the shared migration", () => {
    // migrateScenarioInput runs in the engine tests too, where the golden
    // fixture and the frozen MMMCZCS pin resolve against
    // 2026-07-30-excel-v1 deliberately. Re-pinning there would silently
    // re-cost the fixtures that exist precisely to never move.
    const migrate = read("packages/corridor-schema/src/migrate.ts");
    expect(migrate).not.toMatch(/refBundleId\s*=/);
    expect(migrate).not.toMatch(/repinToCurrentBundle/);
  });

  it("the shared viewer keeps its own staleness affordance", () => {
    // Read-only and deliberately different: it catches the throw, tells the
    // reader the stored view is stale and offers a recompute, rather than
    // silently re-costing someone else's shared numbers.
    const shared = read("apps/web/app/corridor/s/[token]/SharedViewer.tsx");
    expect(shared).toMatch(/refBundleVersion !== DEFAULT_BUNDLE\.bundleId/);
    expect(shared).not.toMatch(/repinToCurrentBundle/);
  });
});
