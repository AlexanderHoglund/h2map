/**
 * Regenerate golden expected files:
 *   npm run golden:update -w @h2map/lcoh-engine
 * Commit the resulting .expected.json changes consciously — CI treats any
 * drift as a regression.
 */
import { writeFileSync } from "node:fs";
import { simulateLCOH } from "../../src/index";
import { caseNames, expectedPath, loadCase } from "./loader";

for (const name of caseNames()) {
  const { inputs, profiles } = loadCase(name);
  const results = simulateLCOH(inputs, profiles);
  writeFileSync(expectedPath(name), JSON.stringify(results, null, 1) + "\n");
  console.log(
    `${name}: LCOH ${results.lcohUsdPerKg.toFixed(4)} USD/kg → ${expectedPath(name)}`,
  );
}
