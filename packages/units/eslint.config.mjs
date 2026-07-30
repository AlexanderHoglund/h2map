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
    // Boundary: units is the bottom of the dependency graph — it imports
    // NOTHING (no workspace packages, no Node builtins). Pure type + assert
    // code only.
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@h2map/*"],
              message:
                "units is the bottom of the dependency graph — it imports no workspace packages.",
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
              message: "units is pure — no Node builtins.",
            },
          ],
        },
      ],
    },
  },
);
