import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Observatory — read-only AI-activity screen. Renders the Posture hero + the Freedom/Learning/Activity
// tiers; each tier shows an honest empty/pending state when there is no data. The dev stack is started by
// playwright's webServer; the local supabase db must be up. (CI runs this; locally it would touch the
// shared supabase db, so it is not part of the dedicated-container loop.)
test("@a11y Observatory: posture + tiers render with no axe violations", async ({ page }) => {
  await page.goto("/observatory");
  await expect(page.getByRole("heading", { name: "Observatory" })).toBeVisible();
  await expect(page.getByLabel("AI posture this week")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Freedom/i })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
