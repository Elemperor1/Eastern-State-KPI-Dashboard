import { fixupConfigRules } from "@eslint/compat";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import globals from "globals";
import tseslint from "typescript-eslint";

const configRoot = import.meta.dirname;

const javascriptFiles = ["**/*.{js,jsx,mjs,cjs}"];
const typescriptFiles = ["**/*.{ts,tsx,mts,cts}"];
const runtimeBoundaryConditionFiles = [
  "src/app/data-entry/_components/StrategicDataEntryClient.tsx",
  "src/app/reports/StrategicTrendsView.tsx",
  "src/app/setup/page.tsx",
  "src/app/setup/_components/StrategicGoalsEditorClient.tsx",
  "src/app/setup/_components/StrategicKpiEditorClient.tsx",
  "src/components/StrategicDistributionBandsEditor.tsx",
  "src/components/StrategicKpiComponentsEditor.tsx",
  "src/components/StrategicTargetEditorCard.tsx",
  "src/components/goal-completion-model.ts",
  "src/components/strategic-data-entry-model.ts",
  "src/components/strategic-goal-editor-model.ts",
  "src/components/strategic-kpi-editor-model.ts",
  "src/components/ui/ExportCSVButton.tsx",
  "src/features/catalog/server.ts",
  "src/features/reporting/strategic-board-report.ts",
  "src/features/strategy/calculations.ts",
  "src/features/strategy/configuration-editing.ts",
  "src/features/strategy/data-entry-server.ts",
  "src/features/strategy/reporting-cycle.ts",
  "src/features/strategy/target-policy.ts",
  "src/lib/auth-regression-helpers.ts",
  "src/lib/csv.ts",
  "src/lib/db.ts",
  "src/lib/request-guard.ts",
];

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      ".agents/**",
      ".codex/**",
      ".ok/**",
      ".pi/**",
      ".turbo/**",
      ".vercel/**",
      "blob-report/**",
      "build/**",
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "out/**",
      "output/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
    ],
  },
  ...fixupConfigRules(nextCoreWebVitals),
  {
    files: javascriptFiles,
    languageOptions: {
      parser: tseslint.parser,
    },
  },
  {
    rules: {
      // React Hooks 7 added these compiler-oriented rules after the previous
      // lint baseline. Adopting them requires behavior-sensitive component
      // refactors, so keep that work separate from the ESLint 10 migration.
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  ...tseslint.configs.recommendedTypeChecked.map(
    ({ plugins: _plugins, ...config }) => ({
      ...config,
      files: typescriptFiles,
    }),
  ),
  {
    files: typescriptFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: configRoot,
      },
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          disallowTypeAnnotations: false,
          fixStyle: "inline-type-imports",
          prefer: "type-imports",
        },
      ],
      // These recommended rules are poor fits for the repository's typed
      // SQLite/form boundaries and promise-shaped framework/mock contracts.
      // They produced high-volume mechanical churn without identifying a
      // behavioral defect during the gate baseline.
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        {
          allowDefaultCaseForExhaustiveSwitch: false,
          considerDefaultExhaustiveForUnions: false,
        },
      ],
      "@typescript-eslint/require-await": "off",
      "import/no-duplicates": [
        "error",
        {
          "prefer-inline": true,
        },
      ],
    },
  },
  {
    files: [
      "**/*.test.{ts,tsx}",
      "e2e/**/*.ts",
      "src/lib/auth-regression-helpers.ts",
    ],
    rules: {
      // Test doubles and response.json() assertions deliberately cross an
      // untyped harness boundary. Runtime code retains the blocking rules.
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
  {
    files: runtimeBoundaryConditionFiles,
    rules: {
      // These existing guards intentionally distrust hydrated form state,
      // SQLite rows, and persisted/legacy payloads more than their static
      // types do. Remove a file from this list when its boundary types encode
      // that runtime absence (or after noUncheckedIndexedAccess is adopted).
      // New TypeScript files remain subject to the blocking rule by default.
      "@typescript-eslint/no-unnecessary-condition": "off",
    },
  },
  {
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: [
      "e2e/**/*.ts",
      "scripts/**/*.{ts,mts,cts}",
      "*.config.{js,mjs,cjs,ts,mts,cts}",
      "next.config.mjs",
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
];

export default eslintConfig;
