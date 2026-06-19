import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// 02:DETAIL-D — E2E + a11y for the NBA action-detail screen (a screen-within-the-cockpit). The dev stack
// is started by playwright's webServer; the local supabase db must be up. Definition renders from the
// catalog (always present); Operation renders even with zero data (shows the empty state).
test("@a11y NBA action detail: two views render + no axe violations", async ({ page }) => {
  await page.goto("/cockpit/action/A1");
  await expect(page.getByRole("heading", { name: /A1/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Definition/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Operation/i })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
