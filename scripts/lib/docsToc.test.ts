import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROOT } from "./serviceDeps";

/**
 * The docs navigation links to anchors. A typo'd id is a DEAD LINK that
 * renders perfectly — the nav shows the entry, the click does nothing, and
 * nothing in a build, a typecheck or a lint notices.
 *
 * So this asserts the correspondence in BOTH directions:
 *   - every id in the tree resolves to a heading that actually renders it;
 *   - every heading that renders an id appears in the tree.
 *
 * The second direction is the one that matters over time: adding an `<H3 id>`
 * without adding it to `toc.ts` produces a section the sidebar silently omits,
 * which is exactly how a two-level nav rots into a one-level one.
 *
 * Asserted against SOURCE rather than a rendered page: the web workspace has
 * no test runner (its scripts are only dev/build/start/lint/typecheck), so
 * this follows the house pattern set by bundleRepin.test.ts and
 * starterSeeding.test.ts.
 */

const page = readFileSync(`${ROOT}apps/web/app/docs/page.tsx`, "utf8");
const toc = readFileSync(`${ROOT}apps/web/app/docs/toc.ts`, "utf8");

/**
 * Ids declared in the tree, in file order.
 *
 * Deliberately NOT anchored to the start of a line: a single-child section
 * writes its entry inline (`children: [{ id: "…", label: "…" }]`), and an
 * anchored pattern silently skips it — which is how this test first reported
 * a phantom orphan.
 */
const tocIds = [...toc.matchAll(/\bid: "([^"]+)"/g)].map((m) => m[1]!);

/** Ids actually rendered by a heading component. */
const headingIds = [...page.matchAll(/<H3?\s+id="([^"]+)"/g)].map((m) => m[1]!);

describe("the docs section tree", () => {
  it("declares a non-trivial number of anchors", () => {
    // Guards against a regex that silently matches nothing, which would make
    // every assertion below vacuously true.
    expect(tocIds.length).toBeGreaterThan(50);
    expect(headingIds.length).toBeGreaterThan(50);
  });

  it("has no duplicate ids", () => {
    // Two headings sharing an id means one of them is unreachable: the
    // browser jumps to the first match, forever.
    const dupes = tocIds.filter((id, i) => tocIds.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it("every tree id is rendered by a heading", () => {
    const missing = tocIds.filter((id) => !headingIds.includes(id));
    expect(missing, "nav entries pointing at nothing").toEqual([]);
  });

  it("every rendered heading id is in the tree", () => {
    // The rot-guard: a sub-heading with an id but no tree entry is invisible
    // to the sidebar.
    const orphans = headingIds.filter((id) => !tocIds.includes(id));
    expect(orphans, "headings the nav does not list").toEqual([]);
  });

  it("every sub-heading carries an id", () => {
    // A nav that lists some sub-sections and silently omits others is worse
    // than one that lists none, so `H3`'s optional id must stay unused.
    const bare = [...page.matchAll(/<H3(\s*)>/g)];
    expect(bare.length, "H3 without an id").toBe(0);
  });

  it("orders the tree in document order", () => {
    // The scroll-spy picks the FIRST on-screen id from this list, so a tree
    // out of document order highlights the wrong entry rather than failing
    // visibly.
    const positions = tocIds.map((id) => page.indexOf(`id="${id}"`));
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);
  });
});

describe("the headings the tree describes", () => {
  it("keeps section labels in step with their headings", () => {
    // The drift this replaced: the old flat TOC said "16. Emission-method
    // validation" while the heading said "…validation & regression". Only the
    // leading number is compared — labels are deliberately shortened for the
    // narrow sidebar — but the NUMBER must match, or the nav sends a reader
    // to the wrong section.
    for (const [, id, label] of toc.matchAll(
      /\{\s*id: "([^"]+)",\s*\n?\s*label: "(\d+)\./g,
    ) as unknown as Iterable<RegExpMatchArray>) {
      const at = page.indexOf(`<H id="${id}">`);
      if (at === -1) continue;
      const heading = page.slice(at, page.indexOf("</H>", at));
      expect(heading, `section ${id}`).toContain(`>${label}.`);
    }
  });
});
