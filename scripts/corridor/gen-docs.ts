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
  ) as {
    ranked: {
      id: string;
      label: string;
      /** How far the field can push the headline cost gap across its swept range. */
      relHeadlineMovement: number;
      /** Max across all headline KPIs — what determines UI placement. */
      maxRelMovement: number;
      /** The KPI that produced maxRelMovement, so placement is traceable. */
      bindingKpi: string;
    }[];
  };
  const manifest = JSON.parse(
    readFileSync(new URL("data/corridor-sensitivity/ui-manifest.json", ROOT), "utf8"),
  ) as { topLevel: string[]; advanced: string[] };
  /**
   * LEVERAGE, from the elasticity harness. A different question from the
   * sweep's movement columns beside it: movement asks how far a field can push
   * the gap across an assumed range, elasticity asks how hard it pushes per
   * unit of itself. The table carries both and the methodology section says
   * why neither replaces the other.
   */
  const elasticity = JSON.parse(
    readFileSync(new URL("data/corridor-sensitivity/elasticity.json", ROOT), "utf8"),
  ) as {
    rows: {
      id: string;
      coupled: boolean;
      couplingGroups: string[];
      scenarios: Record<
        string,
        {
          measurable: boolean;
          perKpi?: Record<string, { up: number; down: number; mean: number }>;
        }
      >;
    }[];
    unperturbable?: { id: string; reason: string }[];
  };
  const elasticityById = new Map(elasticity.rows.map((r) => [r.id, r]));
  /**
   * Why a swept field carries no elasticity — verbatim from the harness.
   *
   * Without this the table shows "—" for three different situations that mean
   * quite different things: not swept at all, swept but unperturbable, and
   * measured as zero. A reader cannot tell "we did not look" from "we looked
   * and it does not move", which is the distinction the whole section is for.
   */
  const unperturbableById = new Map(
    (elasticity.unperturbable ?? []).map((u) => [u.id, u.reason]),
  );
  /**
   * The gap elasticity across archetypes, as a SIGNED range.
   *
   * A RANGE rather than a single number because the spread is the finding:
   * corridor length measures 0.27 on a deep-sea corridor whose burns derive
   * from geometry and exactly 0 where they are typed. Collapsing that to a
   * mean would report a field as "moderately important everywhere" when it is
   * decisive on one archetype and inert on another.
   *
   * SIGNED (R2): the value published here is the signed central difference
   * ((up + down) / 2 of the one-sided estimates) — the SAME quantity the
   * Results tab's live panel displays, so the two surfaces can be compared
   * number for number. A negative value means the gap FALLS as the input
   * rises; the old cells collapsed that to a magnitude, which made fossil
   * vessel CAPEX (−0.20) and green vessel CAPEX (+0.25) read as the same
   * kind of driver when they pull in opposite directions.
   */
  const fmtSigned = (v: number): string => {
    const s = v.toFixed(2);
    if (s === "0.00" || s === "-0.00") return "0.00";
    return v > 0 ? `+${s}` : s.replace("-", "−");
  };
  const elasticityCell = (id: string): string => {
    const row = elasticityById.get(id);
    if (!row) return "—";
    const vs = Object.values(row.scenarios)
      .filter((s) => s.measurable && s.perKpi)
      .map((s) => (s.perKpi!.gapPvUsdM!.up + s.perKpi!.gapPvUsdM!.down) / 2);
    if (vs.length === 0) return "—";
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    return fmtSigned(lo) === fmtSigned(hi)
      ? fmtSigned(lo)
      : `${fmtSigned(lo)} … ${fmtSigned(hi)}`;
  };
  /**
   * Which measurement tier a field is in. Three states, and they are NOT
   * interchangeable:
   *   measured    — an elasticity exists on at least one archetype
   *   swept only  — in the sweep, but no elasticity, with a stated reason
   *   not swept   — outside the sweep entirely (selectors, ids, toggles)
   */
  const statusCell = (sensId: string | undefined): string => {
    if (!sensId) return "not swept";
    if (elasticityCell(sensId) !== "—") return "measured";
    const why = unperturbableById.get(sensId);
    if (!why) return "swept only";
    // A CHOICE (enum) row is measured — every option evaluated, impact = the
    // largest movement across them — it just has no per-unit elasticity,
    // because "10% more fuel choice" is not a thing. "swept only — enum"
    // would read as unmeasured beside a 446% movement figure.
    if (why.startsWith("enum")) return "choice — impact from options";
    // The reason's first clause is the tier; the rest is detail the
    // artifact keeps in full.
    const head = why.split(" — ")[0] ?? why;
    return `swept only — ${head.split(" (")[0] ?? head}`;
  };

  const coupledCell = (id: string): string => {
    const row = elasticityById.get(id);
    return row?.coupled ? `\`${row.couplingGroups.join("`, `")}\`` : "—";
  };
  const rank = new Map(sensitivity.ranked.map((r, i) => [r.id, { i: i + 1, r }]));
  const placement = (id: string): string =>
    manifest.topLevel.includes(id) ? "top-level" : manifest.advanced.includes(id) ? "advanced" : "—";

  // Sensitivity ids don't share every path spelling with the schema; map the
  // known aliases (see scripts/corridor/sensitivity.ts PARAMS).
  const ALIAS: Record<string, string> = {
    // Choices (2026-08-19): sweep id == schema path, one entry each so the
    // orphan guard stays satisfied.
    "green.fuelId": "green.fuelId",
    "fossil.fuelId": "fossil.fuelId",
    "vessel.typeId": "vessel.typeId",
    "green.sourcing": "green.sourcing",
    "fossil.sourcing": "fossil.sourcing",
    "cargo.countryId": "cargo.countryId",
    "regulation.emissions.framework": "regulation.emissions.framework",
    "flags.emissionsBasis": "flags.emissionsBasis",
    "green.emissions.engineType": "green.emissions.engineType",
    "cargo.unit": "cargo.unit",
    "cargo.unitWeightTonnes": "cargo.unitWeightTonnes",
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
    "green.emissions.certifiedWttGco2ePerMj": "green.certifiedWttGco2ePerMj",
    "green.emissions.pilotShare": "green.pilotShare",
    "green.emissions.n2oScenarioId": "green.n2oScenarioId",
    "green.emissions.efficiencyRatio": "green.efficiencyRatio",
    "fossil.emissions.sulphurPercent": "fossil.sulphurPercent",
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
    // Alias: these sweep param ids map to the per-ship schema paths.
    "vessel.green.capexUsdMPerShip": "vessel.green.capexUsdM",
    "vessel.green.opexUsdMPerShipPerYear": "vessel.green.opexUsdMPerYear",
    // Docs-only sweep extension (2026-08-13) — every remaining numeric.
    "cargo.startYear": "cargo.startYear",
    "vessel.fossil.capexUsdMPerShip": "vessel.fossil.capexUsdM",
    "vessel.fossil.opexUsdMPerShipPerYear": "vessel.fossil.opexUsdMPerYear",
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
    "| Field | Type | Required | Sensitivity rank | Gap movement | Max across KPIs | Binding KPI | Elasticity (range across archetypes) | Coupled | Status | UI placement |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const row of rows) {
    const sensId = ALIAS[row.path];
    const hit = sensId ? rank.get(sensId) : undefined;
    lines.push(
      `| \`${row.path}\` | ${row.type} | ${row.required ? "yes" : "no"} | ${
        hit ? `#${hit.i}` : "—"
      } | ${hit ? `${(hit.r.relHeadlineMovement * 100).toFixed(1)}%` : "—"} | ${
        hit ? `${(hit.r.maxRelMovement * 100).toFixed(1)}%` : "—"
      } | ${hit ? `\`${hit.r.bindingKpi}\`` : "—"} | ${
        sensId ? elasticityCell(sensId) : "—"
      } | ${sensId ? coupledCell(sensId) : "—"} | ${statusCell(sensId)} | ${
        sensId ? placement(sensId) : "—"
      } |`,
    );
  }
  lines.push(
    "",
    "Sensitivity sweeps each input across its plausible range (enums across",
    "every defined option) against ALL SIX headline KPIs — gap, $/cargo unit,",
    "$/tCO2 abated, green total, fossil total, lifetime CO2 abated.",
    "",
    "What each column means:",
    "",
    "- **Sensitivity rank** — the field's position when every swept input is",
    "  ordered by gap movement (#1 moves the gap most).",
    "- **Gap movement** — how far the field can push the headline cost gap",
    "  across its swept range, as a percentage of the gap.",
    "- **Max across KPIs** — the largest movement across all six headline",
    "  KPIs; this determines UI placement.",
    "- **Binding KPI** — the output that produced the max, so a field's",
    "  prominence is traceable to what it actually moves.",
    "- **Elasticity (range across archetypes)** — the SIGNED % change in the",
    "  gap per 1% nudge of the field (±1 percentage point for rates): −0.20",
    "  means the gap falls as the input rises. The same quantity the app's",
    "  Results-tab panel computes live. Reported as a range across the three",
    "  reference corridors because the value depends on the scenario.",
    "- **Coupled** — fields that move together in one group so a shared shock",
    "  is not double-counted; the group name is listed.",
    "- **Status** — `measured` = swept and elasticity measured; `swept only —",
    "  …` = swept, but no per-unit elasticity exists (the suffix says why);",
    "  `not swept` = no numeric impact path; `choice — impact from options` =",
    "  a selector swept across every option.",
    "",
    "Baseline is the frozen reference scenario on the app's defaults",
    "(well-to-wake accounting, consumption derived from distance); module",
    "sweeps run with the module enabled — see",
    "`data/corridor-sensitivity/sensitivity.json`. Placement reflects the",
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
      elasticity: sensId ? elasticityCell(sensId) : "—",
      coupled: sensId ? (elasticityById.get(sensId)?.couplingGroups ?? []) : [],
      status: statusCell(sensId),
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
    "the default reference scenario, the expected file is the frozen reference",
    "results (20 years × both sides), and the engine must reproduce them",
    "at 1e-9 (`npm run test:golden`).",
    "",
    "## Modules",
    "",
  ];
  for (const [pkg, rel] of [
    ["@h2map/corridor-engine", "packages/corridor-engine/src"],
    ["@h2map/corridor-schema", "packages/corridor-schema/src"],
    ["@h2map/fuel-emissions", "packages/fuel-emissions/src"],
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
