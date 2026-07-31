import { defineConfig, type Plugin } from "vitest/config";
import path from "node:path";

const SHEBANG = /^#!.*/u;

/**
 * Comments out the leading `#!/usr/bin/env node` of CLI entry points.
 *
 * scripts/*.mjs are executable POSIX entry points (Dockerfile and CI invoke
 * them directly), but Vite inlines them through its transform pipeline on
 * Windows instead of externalizing them to Node, so the `#` reaches the JS
 * parser and the module fails with `SyntaxError: Invalid or unexpected token`.
 * Replacing the line with a same-length comment keeps offsets and line numbers
 * intact, so no source map is needed.
 */
function stripShebang(): Plugin {
  return {
    name: "eskpi-strip-shebang",
    enforce: "pre",
    /** Rewrites a leading shebang to a comment of the same length. */
    transform(code) {
      if (!code.startsWith("#!")) return null;
      return { code: code.replace(SHEBANG, (line) => `//${line.slice(2)}`), map: null };
    },
  };
}

export default defineConfig({
  plugins: [stripShebang()],
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "scripts/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/features/strategy/reporting-cycle.ts"],
      thresholds: {
        // Reporting-period selection is shared by Data Entry and Reports.
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 85,
      },
    },
  },
  // The default transform honors tsconfig.json's `jsx: "preserve"`, so test
  // files that import .tsx sources need an explicit automatic-JSX transform.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
