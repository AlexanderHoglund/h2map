import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROOT } from "./serviceDeps";

/**
 * How a starter project reaches an EXISTING user.
 *
 * The seed route has two gates and they are not interchangeable:
 *
 * - the once-ever stamp (`profiles.projects_seeded_at`) fires exactly once
 *   per account, ever. Right for the original example — delete it and it
 *   stays gone.
 * - ensure-by-name creates a row when the user has none by that name, on
 *   every seed call. Right for anything added AFTER accounts were already
 *   stamped.
 *
 * This test exists because the second Chilean example was first shipped
 * inside the once-ever branch, where it could reach nobody but brand-new
 * users — every existing account was already stamped, so the branch never
 * ran again and the project simply never appeared. The bug is invisible in
 * unit tests (the scenario itself was fine) and invisible to a fresh test
 * account (which is unstamped, so it seeds correctly). It only shows up for
 * a real user who has opened the app before.
 *
 * Asserted against the route source: there is no route-test harness here,
 * and the web workspace has no test runner, so a full HTTP-level test would
 * mean standing up infrastructure disproportionate to one invariant.
 */

const route = readFileSync(
  `${ROOT}apps/web/app/api/v1/corridor/scenarios/seed/route.ts`,
  "utf8",
);

/** The body of the `if (seedExample) { … }` once-ever branch. */
const onceEverBranch = (): string => {
  const start = route.indexOf("if (seedExample) {");
  expect(start, "the once-ever branch has been renamed").toBeGreaterThan(-1);
  let depth = 0;
  for (let i = route.indexOf("{", start); i < route.length; i++) {
    if (route[i] === "{") depth++;
    else if (route[i] === "}" && --depth === 0) return route.slice(start, i + 1);
  }
  throw new Error("unbalanced braces in the seed route");
};

describe("starter seeding reaches existing users", () => {
  it("the second Chilean example is NOT gated on the once-ever stamp", () => {
    // The regression. Existing accounts are already stamped, so anything in
    // this branch is unreachable for them, forever.
    expect(onceEverBranch()).not.toContain("MODERN_EXAMPLE_NAME");
  });

  it("it is ensured by name instead", () => {
    expect(route).toMatch(/ensureByName\(\s*MODERN_EXAMPLE_NAME/);
  });

  it("the Simplified template stays ensured by name", () => {
    expect(onceEverBranch()).not.toContain("SIMPLE_TEMPLATE_NAME");
    expect(route).toMatch(/ensureByName\(\s*SIMPLE_TEMPLATE_NAME/);
  });

  it("the original example stays on the once-ever stamp", () => {
    // The other half of the contract: deleting it must NOT bring it back.
    expect(onceEverBranch()).toContain("Example — Chilean copper corridor");
  });

  it("a failed name lookup does not count as absent", () => {
    // Otherwise a transient error inserts a duplicate on every seed call,
    // and the user accumulates copies of the same starter. Now that the
    // helper can also RESET, the same guard stops a lookup failure from
    // being read as "no row here" and overwriting the wrong thing.
    expect(route).toMatch(/if \(lookupError\) return \{ error: null \};/);
  });

  it("resets ONLY the three reference examples, never the template", () => {
    // ensureByName overwrites when `reset` is set, so this decides whose
    // work can be destroyed. The examples are reference material whose whole
    // value is showing what the model CURRENTLY says — a copy left at an
    // older bundle looks authoritative and is not. The Simplified template
    // is the opposite: a blank starting point people build inside, so
    // resetting it would wipe real work.
    const calls = [
      ...route.matchAll(/ensureByName\(\s*([A-Z_]+),[\s\S]*?\);/g),
    ];
    expect(calls.length, "expected four ensureByName call sites").toBe(4);
    const resetting = calls
      .filter((m) => /\btrue,/.test(m[0]))
      .map((m) => m[1]);
    expect(resetting.sort()).toEqual(
      ["BENCHMARK_EXAMPLE_NAME", "MODERN_EXAMPLE_NAME", "STUDY_EXAMPLE_NAME"].sort(),
    );
    expect(resetting).not.toContain("SIMPLE_TEMPLATE_NAME");
  });

  it("a reset writes through the server-side recompute", () => {
    // Results, engine version and bundle version are derived server-side and
    // never trusted from a client, exactly as an insert does. A reset that
    // wrote inputs without recomputing would leave a row whose stored
    // numbers disagreed with its own scenario.
    const helpers = readFileSync(
      `${ROOT}apps/web/lib/server/corridorScenarios.ts`,
      "utf8",
    );
    expect(helpers).toMatch(/export async function resetScenarioRow/);
    const fn = helpers.slice(helpers.indexOf("export async function resetScenarioRow"));
    expect(fn).toMatch(/evaluateScenario\(resolveScenario\(/);
    expect(fn).toMatch(/engine_version: CORRIDOR_ENGINE_VERSION/);
    expect(fn).toMatch(/ref_bundle_version: payload\.refBundleId/);
  });

  it("the two starter names cannot match each other's selectors", () => {
    // The e2e suite selects the original by regex with .first(); a name
    // containing it as a substring would match non-deterministically.
    const names = [...route.matchAll(/^\s*const \w*NAME = "(.+)";$/gm)]
      .map((m) => m[1])
      .filter((n): n is string => n !== undefined);
    expect(names.length).toBeGreaterThanOrEqual(2);
    for (const a of names) {
      for (const b of names) {
        if (a !== b) expect(b.includes(a), `"${b}" contains "${a}"`).toBe(false);
      }
    }
  });
});
