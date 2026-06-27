import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
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
  // The default esbuild config doesn't honor tsconfig.json's `jsx: "preserve"`,
  // so test files that import .tsx sources (or use JSX themselves) fail to
  // transform. Tell esbuild to treat .tsx as automatic-JSX.
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});