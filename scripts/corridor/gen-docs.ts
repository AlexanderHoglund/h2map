/**
 * Generated corridor docs (build-plan 4.3) — "docs generated, not written":
 *
 *   docs/corridor/field-reference.md  — every scenario field from the zod
 *     schema (path, type, required), joined with its sensitivity rank and
 *     ui-manifest placement (top-level vs advanced) and wizard step.
 *   docs/corridor/modules.md — one section per engine/schema module with the
 *     same headings (purpose, boundary, exports, assumptions), extracted from
 *     the source (header docblock + import list + export signatures).
 *   Worked examples = fixtures/golden/corridor (pointer section).
 *
 *   npx tsx scripts/corridor/gen-docs.ts          # regenerate
 * CI regenerates and fails on diff — the docs must track the code.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { scenarioInputSchema } from "@h2map/corridor-schema";

const ROOT = new URL("../../", import.meta.url);
const OUT = new URL("docs/corridor/", ROOT);

// ---------------------------------------------------------------------------
// Field reference
// ---------------------------------------------------------------------------

interface FieldRow {
  path: string;
  type: string;
  required: boolean;
}

function walkJsonSchema(
  node: Record<string, unknown>,
  path: string,
  requiredHere: boolean,
  out: FieldRow[],
): void {
  const type = node.type as string | undefined;
  if (type === "object" && node.properties) {
    const required = new Set((node.required as string[] | undefined) ?? []);
    for (const [key, child] of Object.entries(node.properties as Record<string, unknown>)) {
      walkJsonSchema(
        child as Record<string, unknown>,
        path ? `${path}.${key}` : key,
        required.has(key),
        out,
      );
    }
    return;
  }
  if (Array.isArray(node.anyOf)) {
    const parts = (node.anyOf as Record<string, unknown>[]).map(
      (p) => (p.type as string) ?? (p.const !== undefined ? JSON.stringify(p.const) : "…"),
    );
    // ", " not " | " — pipes break the markdown table.
    out.push({ path, type: parts.join(", "), required: requiredHere });
    return;
  }
  let label = type ?? "unknown";
  if (node.enum) label = (node.enum as unknown[]).map((v) => JSON.stringify(v)).join(", ");
  if (node.const !== undefined) label = `= ${JSON.stringify(node.const)}`;
  out.push({ path, type: label, required: requiredHere });
}

function fieldReference(): string {
  const jsonSchema = z.toJSONSchema(scenarioInputSchema, {
    unrepresentable: "any",
    io: "input",
  }) as Record<string, unknown>;
  const rows: FieldRow[] = [];
  walkJsonSchema(jsonSchema, "", true, rows);

  const sensitivity = JSON.parse(
    readFileSync(new URL("data/corridor-sensitivity/sensitivity.json", ROOT), "utf8"),
  ) as { ranked: { id: string; label: string; relHeadlineMovement: number }[] };
  const manifest = JSON.parse(
    readFileSync(new URL("data/corridor-sensitivity/ui-manifest.json", ROOT), "utf8"),
  ) as { topLevel: string[]; advanced: string[] };
  const rank = new Map(sensitivity.ranked.map((r, i) => [r.id, { i: i + 1, r }]));
  const placement = (id: string): string =>
    manifest.topLevel.includes(id) ? "top-level" : manifest.advanced.includes(id) ? "advanced" : "—";

  // Sensitivity ids don't share every path spelling with the schema; map the
  // known aliases (see scripts/corridor/sensitivity.ts PARAMS).
  const ALIAS: Record<string, string> = {
    "financing.greenRate": "financing.greenRate",
    "financing.baseRate": "financing.baseRate",
    "financing.debtShare": "financing.debtShare",
    "financing.tenorYears": "financing.tenorYears",
    "capitalPhasing.green.weights": "capitalPhasing.years",
    "capitalPhasing.fossil.weights": "capitalPhasing.years",
    "cargo.waccOverride": "cargo.wacc",
    "green.overrides.priceUsdPerTonne": "green.priceUsdPerTonne",
    "green.overrides.fuelTonnesPerVesselYear": "green.fuelTonnesPerVesselYear",
    "green.overrides.prodCapexUsdM": "green.prodCapexUsdM",
    "green.overrides.prodOpexUsdMPerYear": "green.prodOpexUsdMPerYear",
    "green.overrides.wtwGco2PerMj": "green.wtwGco2PerMj",
    "fossil.overrides.priceUsdPerTonne": "fossil.priceUsdPerTonne",
    "fossil.overrides.wtwGco2PerMj": "fossil.wtwGco2PerMj",
    "green.overrides.portStorageCapexUsdM": "port.storageCapexUsdM",
    "green.overrides.portStorageOpexUsdMPerYear": "port.storageOpexUsdMPerYear",
    "green.overrides.bargeCapexUsdM": "port.bargeCapexUsdM",
    "regulation.ets.euaEurPerTonne": "regulation.euaEurPerTonne",
    "regulation.eurUsd": "regulation.eurUsd",
    "regulation.fuelEu.penaltyEurPerTonne": "regulation.fuelEuPenalty",
    "regulation.ets.scope": "regulation.etsScope",
    "regulation.fuelEu.scope": "regulation.fuelEuScope",
    "cargo.oneWayDistanceNm": "cargo.oneWayDistanceNm",
    "cargo.horizonYears": "cargo.horizonYears",
    "cargo.unitsPerYear": "cargo.unitsPerYear",
    "cargo.inflation": "cargo.inflation",
    "cargo.vessels": "cargo.vessels",
    "cargo.roundtripsPerYear": "cargo.roundtripsPerYear",
    "vessel.green.capexUsdM": "vessel.green.capexUsdM",
    "vessel.green.opexUsdMPerYear": "vessel.green.opexUsdMPerYear",
    // Docs-only sweep extension (2026-08-13) — every remaining numeric.
    "cargo.startYear": "cargo.startYear",
    "vessel.fossil.capexUsdM": "vessel.fossil.capexUsdM",
    "vessel.fossil.opexUsdMPerYear": "vessel.fossil.opexUsdMPerYear",
    "green.overrides.combustionEfTco2PerTonne": "green.combustionEf",
    "green.overrides.lhvMjPerTonne": "green.lhvMjPerTonne",
    "green.overrides.bargeOpexUsdMPerYear": "port.bargeOpexUsdMPerYear",
    "fossil.overrides.fuelTonnesPerVesselYear": "fossil.fuelTonnesPerVesselYear",
    "fossil.overrides.combustionEfTco2PerTonne": "fossil.combustionEf",
    "fossil.overrides.lhvMjPerTonne": "fossil.lhvMjPerTonne",
    "fossil.overrides.portStorageCapexUsdM": "port.fossilStorageCapexUsdM",
    "fossil.overrides.portStorageOpexUsdMPerYear": "port.fossilStorageOpexUsdMPerYear",
    "fossil.overrides.bargeCapexUsdM": "port.fossilBargeCapexUsdM",
    "fossil.overrides.bargeOpexUsdMPerYear": "port.fossilBargeOpexUsdMPerYear",
    "regulation.ets.euaEscalation": "regulation.euaEscalation",
    "regulation.fuelEu.vlsfoMjPerTonne": "regulation.fuelEuVlsfoMjPerTonne",
    "regulation.fuelEu.baselineGco2PerMj": "regulation.fuelEuBaselineGco2PerMj",
    "regulation.fuelEu.credit.surplusValueEurPerTonneVlsfoEq": "regulation.fuelEuCreditSurplusValue",
    "regulation.selfDesigned.co2PriceUsdPerTonne": "regulation.selfCo2PriceUsdPerTonne",
    "regulation.selfDesigned.co2PriceEscalation": "regulation.selfCo2PriceEscalation",
    "regulation.selfDesigned.supportUsdPerKg": "regulation.selfSupportUsdPerKg",
    "regulation.selfDesigned.capexSupport": "regulation.selfCapexSupport",
    "regulation.selfDesigned.opexSupport": "regulation.selfOpexSupport",
    "regulation.selfDesigned.otherUsdM": "regulation.selfOtherUsdM",
    "regulation.ira45z.creditUsdPerGallon": "regulation.ira45zCreditUsdPerGallon",
    "regulation.imoNetZero.scope": "regulation.imoScope",
    "regulation.imoNetZero.rewardUsdPerTonneCo2e": "regulation.imoRewardUsdPerTonneCo2e",
    "regulation.imoNetZero.priceEscalation": "regulation.imoPriceEscalation",
  };

  // Completeness guard: a renamed/added PARAMS id that no ALIAS consumes
  // would silently vanish from the docs — fail loudly instead.
  const consumed = new Set(Object.values(ALIAS));
  const orphans = sensitivity.ranked
    .map((r) => r.id)
    .filter((id) => !consumed.has(id));
  if (orphans.length) {
    console.error(
      `gen-docs: sensitivity ids missing an ALIAS entry: ${orphans.join(", ")}`,
    );
    process.exit(1);
  }

  const lines = [
    "# Corridor scenario — field reference",
    "",
    "GENERATED by `scripts/corridor/gen-docs.ts` from the zod schema",
    "(`@h2map/corridor-schema`) joined with the sensitivity artifact and the",
    "ui-manifest. Do not edit by hand — CI fails on drift.",
    "",
    "| Field | Type | Required | Sensitivity rank | Headline movement | UI placement |",
    "|---|---|---|---|---|---|",
  ];
  for (const row of rows) {
    const sensId = ALIAS[row.path];
    const hit = sensId ? rank.get(sensId) : undefined;
    lines.push(
      `| \`${row.path}\` | ${row.type} | ${row.required ? "yes" : "no"} | ${
        hit ? `#${hit.i}` : "—"
      } | ${hit ? `${(hit.r.relHeadlineMovement * 100).toFixed(1)}%` : "—"} | ${
        sensId ? placement(sensId) : "—"
      } |`,
    );
  }
  lines.push(
    "",
    "Sensitivity = max headline-gap movement across the input's plausible range",
    "(one-at-a-time endpoint sweep from the Excel-default baseline; module",
    "sweeps run with the module enabled — see",
    "`data/corridor-sensitivity/sensitivity.json`). Placement reflects the",
    "FROZEN ui-flagged subset: `top-level` renders prominently in the wizard,",
    "`advanced` behind the Standard view, `—` = not part of the UI prominence",
    "contract (docs-ranked only, dedicated control, or descriptive).",
    "",
  );

  // The same rows as machine-readable JSON — the docs page (§14 Complete
  // input inventory) renders THIS artifact, so it can never drift from the
  // markdown reference.
  const jsonRows = rows.map((row) => {
    const sensId = ALIAS[row.path];
    const hit = sensId ? rank.get(sensId) : undefined;
    return {
      path: row.path,
      type: row.type,
      required: row.required,
      rank: hit ? hit.i : null,
      movementPct: hit
        ? Number((hit.r.relHeadlineMovement * 100).toFixed(1))
        : null,
      placement: sensId ? placement(sensId) : "—",
    };
  });
  writeFileSync(
    new URL("data/corridor-sensitivity/field-reference.json", ROOT),
    JSON.stringify({ generatedBy: "scripts/corridor/gen-docs.ts", rows: jsonRows }, null, 1) +
      "\n",
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Module pages
// ---------------------------------------------------------------------------

function headerDocblock(src: string): string {
  // The header docblock may sit after "use client" and/or the import
  // block (complete.ts does) — accept the first /** ... */ above any
  // executable statement rather than requiring it at byte zero.
  const m = /^(?:"use client";\s*)?(?:import[^;]*;\s*)*\/\*\*([\s\S]*?)\*\//.exec(
    src.trimStart(),
  );
  if (!m) return "_(no header docblock)_";
  return m[1]!
    .split("\n")
    .map((l) => l.replace(/^\s*\*? ?/, ""))
    .join("\n")
    .trim();
}

function moduleSection(pkg: string, dir: string, file: string): string {
  const src = readFileSync(join(dir, file), "utf8");
  const imports = [...src.matchAll(/^import .*?from "(.+?)";/gm)].map((m) => m[1]!);
  const exports = [
    ...src.matchAll(/^export (?:async )?(?:function|const|interface|type|class) ([A-Za-z0-9_]+)/gm),
  ].map((m) => m[1]!);
  const doc = headerDocblock(src);
  // Whole PARAGRAPHS, not single lines — line-level filtering produced
  // mid-sentence fragments in the generated pages.
  const assumptions =
    doc
      .split(/\n\s*\n/)
      .filter((par) => /assum|benchmark|planning-level|verbatim|divergence|D[1-7]\b/i.test(par))
      .slice(0, 3)
      .join("\n\n") || "Documented inline (see source).";
  return [
    `### \`${pkg}/${file}\``,
    "",
    "**Purpose**",
    "",
    doc.split("\n\n")[0] ?? doc,
    "",
    `**Boundary (imports)**: ${imports.length ? imports.map((i) => `\`${i}\``).join(", ") : "none — leaf module"}`,
    "",
    `**Exports (inputs/outputs)**: ${exports.length ? exports.map((e) => `\`${e}\``).join(", ") : "—"}`,
    "",
    "**Assumptions**",
    "",
    assumptions,
    "",
  ].join("\n");
}

function modulesDoc(): string {
  const sections: string[] = [
    "# Corridor engine — module pages",
    "",
    "GENERATED by `scripts/corridor/gen-docs.ts` from the dependency graph and",
    "each module's header docblock. Do not edit by hand — CI fails on drift.",
    "",
    "Dependency rule (lint-enforced): `units → corridor-schema → corridor-engine`;",
    "the engine imports nothing else and performs no I/O.",
    "",
    "## Worked examples",
    "",
    "`fixtures/golden/corridor/` doubles as the worked-example set: the input is",
    "the workbook's default scenario, the expected file is the workbook's own",
    "cached values (20 years × both sides), and the engine must reproduce them",
    "at 1e-9 (`npm run test:golden`).",
    "",
    "## Modules",
    "",
  ];
  for (const [pkg, rel] of [
    ["@h2map/corridor-engine", "packages/corridor-engine/src"],
    ["@h2map/corridor-schema", "packages/corridor-schema/src"],
  ] as const) {
    const dir = new URL(`${rel}/`, ROOT).pathname.replace(/^\/([A-Za-z]:)/, "$1");
    const files = readdirSync(dir, { recursive: true }) as string[];
    for (const f of files.filter((f) => f.endsWith(".ts")).sort()) {
      sections.push(moduleSection(pkg, dir, f));
    }
  }
  return sections.join("\n");
}

// ---------------------------------------------------------------------------

function main(): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(new URL("field-reference.md", OUT), fieldReference());
  writeFileSync(new URL("modules.md", OUT), modulesDoc());
  console.log(
    "wrote docs/corridor/{field-reference,modules}.md + data/corridor-sensitivity/field-reference.json",
  );
}

main();
