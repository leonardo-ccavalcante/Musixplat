import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

const alias = {
  "@": fileURLToPath(new URL("./client/src", import.meta.url)),
  "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
  "@server": fileURLToPath(new URL("./server", import.meta.url)),
};

// Three named projects (CLAUDE.md §1):
//  - unit        : pure logic + React component tests (jsdom)
//  - antifake    : §14 NULL-pre-run gate against the local docker DB (node)
//  - integration : RLS / handoff / concurrency against the local docker DB (node)
export default defineConfig({
  resolve: { alias },
  test: {
    globals: true,
    // DB-backed projects mutate a shared local db — keep files serial to avoid races.
    fileParallelism: false,
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./tests/setup.unit.ts"],
          include: [
            "client/**/*.test.{ts,tsx}",
            "shared/**/*.test.ts",
            "server/**/*.test.ts",
            "tests/unit/**/*.test.ts",
          ],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "antifake",
          environment: "node",
          globals: true,
          include: ["tests/antifake/**/*.test.ts"],
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          globals: true,
          include: ["tests/integration/**/*.test.ts"],
          // serialized resetDb + 90k-row seed + full runP01(5000) per test, cold on the CI runner
          // ⇒ generous per-test/hook budget (the cold first test is the slowest).
          testTimeout: 300_000,
          hookTimeout: 300_000,
        },
      },
    ],
  },
});
