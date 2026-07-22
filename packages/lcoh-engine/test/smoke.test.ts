import { describe, expect, it } from "vitest";

describe("engine package", () => {
  it("loads", async () => {
    const mod = await import("../src/index.js");
    expect(mod).toBeDefined();
  });
});
