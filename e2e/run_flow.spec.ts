import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Gate 1 — the operator drives the spine IN-PRODUCT with NO terminal. Pre-state: `pnpm prototype:reset`
// staged POOL-PAY raw (board EMPTY, no diagnosis yet). Clicking "Run flow" = reportProblem ⇒ diagnosis.run
// ⇒ the board populates from the REAL orchestrator (47 affected / 35 silent / €3760) — numbers PRODUCED,
// never seeded. Run AFTER `pnpm prototype:reset` (separate from diagnosis.spec.ts, which uses db:05b).

test("@a11y Run flow drives the spine in-product and populates the board", async ({ page }) => {
  await page.goto("/diagnosis");
  await expect(page.getByRole("heading", { name: "Support · Diagnosis" })).toBeVisible();

  const runBtn = page.getByRole("button", { name: /Run flow/i });
  await expect(runBtn).toBeVisible({ timeout: 20_000 });
  await runBtn.click();

  // PROOF the spine ran in-product (no terminal): the aria-live status carries the PRODUCED numbers.
  await expect(page.getByText(/Diagnosed · 47 affected · 35 silent · €3760/i)).toBeVisible({ timeout: 30_000 });
  // PROOF the board refetched + populated: the silent-cascade hero and an openable dossier appear.
  await expect(page.getByRole("region", { name: "Silent cascade" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Open dossier/i }).first()).toBeVisible();
  await page.screenshot({ path: "test-results/run-flow.png", fullPage: true });

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
});
