import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseUncertaintyDataset,
  uncertaintyFor,
  unresolvedUncertaintyIds,
  type UncertaintyDataset,
} from "@h2map/corridor-schema";
import { ROOT } from "./serviceDeps";
import { COUPLING_GROUPS, PARAMS } from "../corridor/lib/params";

/**
 * The researched uncertainty dataset — the EXPOSURE half of impact.
 *
 * The governing rule is that a range without a defensible basis does not
 * exist, so most of what is asserted here is provenance rather than value:
 * the numbers belong to the research and will change when it is redone, but
 * a row that loses its basis, its source or its scope must fail loudly.
 */

const RAW = JSON.parse(
  readFileSync(
    `${ROOT}data/input-uncertainty-ref/2026-08-19-uncertainty-v1.json`,
    "utf8",
  ),
) as unknown;
const ds: UncertaintyDataset = parseUncertaintyDataset(RAW);

/** A deep clone of the dataset, for constructing deliberate violations. */
const mutate = (edit: (d: Record<string, unknown>) => void): unknown => {
  const copy = JSON.parse(JSON.stringify(RAW)) as Record<string, unknown>;
  edit(copy);
  return copy;
};
const firstRow = (d: Record<string, unknown>) =>
  (d.rows as Record<string, unknown>[])[0]!;

describe("the dataset parses and is complete", () => {
  it("carries a non-trivial number of rows and sources", () => {
    // Anti-vacuity: an empty dataset satisfies every assertion below.
    expect(ds.rows.length).toBeGreaterThan(8);
    expect(ds.rows.reduce((a, r) => a + r.sources.length, 0)).toBeGreaterThan(20);
  });

  it("names its own version to match its filename", () => {
    // House convention: the stem IS the version, so a copy cannot masquerade
    // as the original.
    expect(ds.datasetVersion).toBe("2026-08-19-uncertainty-v1");
  });

  it("gives every row a cited basis, a source and a verified flag", () => {
    for (const r of ds.rows) {
      expect(r.uncertaintyBasis.length, r.id).toBeGreaterThan(40);
      expect(r.sources.length, r.id).toBeGreaterThan(0);
      expect(typeof r.verified, r.id).toBe("boolean");
      for (const s of r.sources) {
        expect(s.figureUsed.length, `${r.id} figureUsed`).toBeGreaterThan(0);
        expect(s.url.length, `${r.id} url`).toBeGreaterThan(0);
      }
    }
  });

  it("keeps an explicit unquantified list, even when empty", () => {
    // An empty array says "everything considered was quantified", which is a
    // different claim from the field being absent.
    expect(Array.isArray(ds.unquantified)).toBe(true);
  });
});

describe("the schema refuses malformed rows", () => {
  it("rejects low > high", () => {
    // Unlike the corridor bundle's scaleExponent — which descends on purpose
    // and is documented — every band here ascends.
    expect(() =>
      parseUncertaintyDataset(
        mutate((d) => {
          const r = firstRow(d);
          const lo = r.low as number;
          r.low = r.high;
          r.high = lo;
        }),
      ),
    ).toThrow();
  });

  it("rejects a mode outside its own range", () => {
    expect(() =>
      parseUncertaintyDataset(
        mutate((d) => {
          firstRow(d).mode = (firstRow(d).high as number) + 1;
        }),
      ),
    ).toThrow();
  });

  it("rejects a triangular row with no mode", () => {
    expect(() =>
      parseUncertaintyDataset(
        mutate((d) => {
          const r = firstRow(d);
          r.distribution = "triangular";
          delete r.mode;
        }),
      ),
    ).toThrow();
  });

  it("rejects an empty uncertaintyBasis", () => {
    // THE GOVERNING RULE. An undefended range must be unrepresentable, not
    // merely discouraged.
    expect(() =>
      parseUncertaintyDataset(
        mutate((d) => {
          firstRow(d).uncertaintyBasis = "";
        }),
      ),
    ).toThrow();
  });

  it("rejects a row with no sources", () => {
    expect(() =>
      parseUncertaintyDataset(
        mutate((d) => {
          firstRow(d).sources = [];
        }),
      ),
    ).toThrow();
  });
});

describe("the ids join to the model", () => {
  const knownIds = [...PARAMS.map((p) => p.id), ...COUPLING_GROUPS.map((g) => g.id)];

  it("resolves every row id", () => {
    // A typo'd id parses perfectly, joins to nothing, and is silently dropped
    // from every impact figure — invisible to build, typecheck and lint.
    expect(unresolvedUncertaintyIds(ds, knownIds)).toEqual([]);
  });

  it("detects an id that resolves to nothing", () => {
    // Proves the check above is not vacuous.
    const broken = parseUncertaintyDataset(
      mutate((d) => {
        firstRow(d).id = "cargo.thisFieldDoesNotExist";
      }),
    );
    expect(unresolvedUncertaintyIds(broken, knownIds)).toEqual([
      "cargo.thisFieldDoesNotExist",
    ]);
  });

  it("declares vessel-opex as a real coupling group", () => {
    // Added for this import: the research priced vessel OPEX per hull CLASS,
    // and one class serves both sides of an archetype.
    expect(COUPLING_GROUPS.map((g) => g.id)).toContain("vessel-opex");
  });
});

describe("scope is load-bearing, not decorative", () => {
  it("scopes the e-methanol price to archetype C only", () => {
    // THE MAPPING MOST LIKELY TO BE GOT WRONG, and the most silent if it is.
    // A and B run e-ammonia against a band already verified in the corridor
    // bundle (640/900/1330, Platts + H2Global); applying a methanol range
    // there would replace better data with worse.
    const rows = ds.rows.filter((r) => r.id === "green.priceUsdPerTonne");
    expect(rows.length).toBe(1);
    expect(rows[0]!.scenarioScope).toEqual(["C"]);
    expect(uncertaintyFor(ds, "A").map((r) => r.id)).not.toContain(
      "green.priceUsdPerTonne",
    );
    expect(uncertaintyFor(ds, "B").map((r) => r.id)).not.toContain(
      "green.priceUsdPerTonne",
    );
    expect(uncertaintyFor(ds, "C").map((r) => r.id)).toContain(
      "green.priceUsdPerTonne",
    );
  });

  it("gives every archetype exactly one range per id", () => {
    // The class-scoped vessel rows would otherwise double up — three
    // fleet-capital rows exist, and exactly one must apply per archetype.
    for (const key of ["A", "B", "C"]) {
      const ids = uncertaintyFor(ds, key).map((r) => r.id);
      expect([...new Set(ids)].length, `${key} has a duplicate id`).toBe(ids.length);
    }
  });

  it("resolves the vessel groups per archetype", () => {
    for (const key of ["A", "B", "C"]) {
      const ids = uncertaintyFor(ds, key).map((r) => r.id);
      expect(ids, key).toContain("fleet-capital");
      expect(ids, key).toContain("vessel-opex");
    }
  });
});

describe("the elasticity artifact carries the product", () => {
  const art = JSON.parse(
    readFileSync(`${ROOT}data/corridor-sensitivity/elasticity.json`, "utf8"),
  ) as {
    uncertaintyDatasetVersion: string;
    rows: { id: string; scenarios: Record<string, Record<string, unknown>> }[];
    groups: { id: string; scenarios: Record<string, Record<string, unknown>> }[];
  };

  it("pins the dataset version it was computed against", () => {
    // Leverage and exposure are versioned separately; the artifact has to say
    // which exposure it multiplied by.
    expect(art.uncertaintyDatasetVersion).toBe(ds.datasetVersion);
  });

  it("computes impact wherever both halves exist", () => {
    const withImpact = [...art.rows, ...art.groups].flatMap((r) =>
      ["A", "B", "C"]
        .map((k) => r.scenarios[k]?.exposure as Record<string, number> | null | undefined)
        .filter((e) => e && e.impact != null),
    );
    expect(withImpact.length).toBeGreaterThan(8);
  });

  it("leaves impact NULL where no uncertainty is declared", () => {
    // Never zero: zero reads as "measured, and it does not matter", which is
    // the opposite of "nobody has said".
    const noExposure = art.rows.filter(
      (r) => r.scenarios.A?.measurable && r.scenarios.A.exposure === null,
    );
    expect(noExposure.length).toBeGreaterThan(0);
  });
});
