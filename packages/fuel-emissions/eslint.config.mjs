import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Governing rule: the engine is PURE and does no I/O. No fetch, no
    // database, no clock, no randomness; plain data in, plain data out.
    // Enforced, not promised (build-plan cross-cutting rule 1). Test files
    // are exempt (the golden loader reads fixtures from disk).
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "node:*",
                "fs",
                "fs/*",
                "path",
                "os",
                "child_process",
                "http",
                "https",
                "crypto",
                "url",
                "util",
                "stream",
                "zlib",
                "net",
                "worker_threads",
              ],
              message:
                "fuel-emissions is pure: no Node builtins. Take data as arguments.",
            },
            {
              group: ["@h2map/*", "!@h2map/units"],
              message:
                "fuel-emissions depends only on @h2map/units (one-way graph).",
            },
            {
              group: ["**/*.json"],
              message:
                "the engine takes reference data as arguments; it never loads it.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "pure engine — no network" },
        { name: "process", message: "pure engine — no environment access" },
        { name: "XMLHttpRequest", message: "pure engine — no network" },
        { name: "WebSocket", message: "pure engine — no network" },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: "engine must be deterministic" },
        { object: "Math", property: "random", message: "engine must be deterministic" },
      ],
    },
  },
);
