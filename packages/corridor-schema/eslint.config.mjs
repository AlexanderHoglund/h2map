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
              group: ["@h2map/*", "!@h2map/units"],
              message:
                "corridor-schema depends only on @h2map/units (dependency graph: units → schema → engine).",
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
