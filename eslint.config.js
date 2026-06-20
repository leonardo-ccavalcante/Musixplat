import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "supabase/**",
      "specs/**", // docs + a do-not-use workflow .mjs (not app source)
      "docs/**", // build-docs + plan/workflow scaffolds (not app source) — same class as specs/**
      ".claude/**", // agent session artifacts (persisted workflow scripts) — not app source; absent on CI
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // zero `any` (CLAUDE.md §1 — strict)
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
);
