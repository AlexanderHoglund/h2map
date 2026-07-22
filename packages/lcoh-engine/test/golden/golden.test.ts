import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { simulateLCOH } from "../../src/index";
import { caseNames, diffValues, expectedPath, loadCase } from "./loader";

describe("golden files", () => {
  for (const name of caseNames()) {
    it(`reproduces ${name} at relative tolerance 1e-12`, () => {
      const path = expectedPath(name);
      if (!existsSync(path)) {
        throw new Error(
          `missing ${path} — run: npm run golden:update -w @h2map/lcoh-engine`,
        );
      }
      const { inputs, profiles } = loadCase(name);
      const actual = simulateLCOH(inputs, profiles);
      const expected = JSON.parse(readFileSync(path, "utf8")) as unknown;
      const diffs = diffValues(
        JSON.parse(JSON.stringify(actual)),
        expected,
      );
      expect(diffs).toEqual([]);
    });
  }
});
