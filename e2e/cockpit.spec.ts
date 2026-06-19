import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// E2E + a11y for Screen 02 (Autonomy Cockpit). The dev stack is started by playwright's webServer; the
// local supabase db must be up with P02 data (pnpm db:p02). Exercises the REAL flow end-to-end: AI-proposed
// NBAs → autonomy verdict (AUTO vs needs-human) → a human Release that records a Decision_Trace.

test("@a11y Autonomy Cockpit renders proposals + verdicts + passes axe (WCAG 2.1 AA)", async ({ page }) => {
  await page.goto("/cockpit");
  await expect(page.getByRole("heading", { name: "Autonomy Cockpit" })).toBeVisible();

  // Proposals load (at least one cohort card), and both verdicts appear on the board.
  await expect(page.getByRole("region", { name: "Needs your decision" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/AUTO · AI acts alone/).first()).toBeVisible();
  await expect(page.getByText(/Needs human/).first()).toBeVisible();

  await page.screenshot({ path: "test-results/cockpit.png", fullPage: true });

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
});

test("a human Release records a Decision_Trace (shows the trace id)", async ({ page }) => {
  await page.goto("/cockpit");
  await expect(page.getByRole("region", { name: "Needs your decision" })).toBeVisible({ timeout: 20_000 });

  const release = page.getByRole("button", { name: "Release" }).first();
  await expect(release).toBeVisible();
  await release.click();
  await expect(page.getByText(/Released ✓ trace/).first()).toBeVisible({ timeout: 10_000 });
});
