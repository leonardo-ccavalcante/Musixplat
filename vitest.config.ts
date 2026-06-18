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
          // resetDb (truncate + ~110k-row seed) ~5-10s cold on the CI runner; no producers/ANALYZE here.
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          globals: true,
          include: ["tests/integration/**/*.test.ts"],
          // resetDb (truncate + ~110k-row seed) + full runP01(5000) (which ANALYZEs after assignment)
          // ≈ 10s cold on the CI runner. (Was 300s while runP01 nested-looped the Order table for 287s
          // on a fresh, unanalyzed db — root-caused: the ANALYZE in runP01, so 60s is ~6× real headroom.)
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
