import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Gate 6 / MASTER ACCEPTANCE — a human drives the WHOLE spine from the UI, NO terminal. Pre-state:
// `pnpm prototype:reset` staged POOL-PAY raw (board EMPTY). One click on "Run flow" = reportProblem →
// diagnosis.run → artifact.generate; then the human gate (Approve) writes a 4-eyes trace; the 1:10 node
// shows the derived leverage. Every number is PRODUCED server-side (47/35/€3760, ratio), never seeded.
// Run AFTER `pnpm prototype:reset`. Separate from diagnosis.spec.ts (which uses the pre-diagnosed db:05b).

test("@a11y full spine in-product: Run flow → diagnose → artifact → approve → 1:10", async ({ page }) => {
  await page.goto("/diagnosis");
  await expect(page.getByRole("heading", { name: "Support · Diagnosis" })).toBeVisible();

  const runBtn = page.getByRole("button", { name: /Run flow/i });
  await expect(runBtn).toBeVisible({ timeout: 20_000 });
  await runBtn.click();

  // diagnosed with PRODUCED counts + an artifact queued for the human gate (no terminal involved).
  await expect(page.getByText(/Diagnosed · 47 affected · 35 silent · €3760/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: /needs your decision/i })).toBeVisible();

  // human exception gate: approve ⇒ append-only 4-eyes trace, status flips.
  await page.getByRole("button", { name: /^Approve$/ }).first().click();
  await expect(page.getByText(/approved · trace/i)).toBeVisible({ timeout: 15_000 });

  // 1:10 leverage now carries a derived signal. The node reads the produced `ratio_1_10` (gov.fn_roi_1_10),
  // which is the team-equivalent capacity capped at `baseline_team_size` (10) — one operator ≈ a team of ten,
  // the literal "1:10". (units-per-touch, 47, is now a separate field, not this node.) ⇒ "10 : 1".
  await expect(page.getByText("10 : 1").first()).toBeVisible({ timeout: 15_000 });

  await page.screenshot({ path: "test-results/run-flow.png", fullPage: true });

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
});
