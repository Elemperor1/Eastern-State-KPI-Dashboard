import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
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
      include: ["src/lib/analytics.ts"],
      thresholds: {
        // §3.2 from the product roadmap mandates ≥ 90% line coverage.
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
