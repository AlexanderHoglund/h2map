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
    // Boundary: corridor-schema sits above units only. zod is allowed (pure,
    // no I/O); Node builtins are not — file I/O belongs to consumers.
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // v6: schema also consumes @h2map/fuel-emissions for the
              // refined factor derivation (acyclic: units → fuel-emissions
              // → schema → engine; fuel-emissions never imports schema).
              group: ["@h2map/*", "!@h2map/units", "!@h2map/fuel-emissions"],
              message:
                "corridor-schema depends only on @h2map/units and @h2map/fuel-emissions (dependency graph: units → fuel-emissions → schema → engine).",
            },
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
                "corridor-schema is pure — no Node builtins. Consumers do the I/O and hand in plain data.",
            },
          ],
        },
      ],
    },
  },
);
