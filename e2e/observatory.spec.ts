import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Observatory — read-only AI-activity screen, redesigned: the eval-coach HERO leads, "Needs you" triages
// what awaits the operator, and the Activity/Learning/Limits tiers collapse to one-line summaries. Each tier
// shows an honest empty/pending state when there is no data. The dev stack is started by playwright's
// webServer; the local supabase db must be up. (CI runs this; locally it would touch the shared supabase db,
// so it is not part of the dedicated-container loop.)
test("@a11y Observatory: hero + posture + tiers render with no axe violations", async ({ page }) => {
  await page.goto("/observatory");
  await expect(page.getByRole("heading", { name: "Observatory" })).toBeVisible();
  // the hero (the path that raises autonomy) and the three collapsible tier headings
  await expect(page.getByRole("heading", { name: /Raise autonomy/i })).toBeVisible();
  await expect(page.getByLabel("AI posture this week")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Activity/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Learning/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Limits/i })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("Observatory: a collapsed tier opens to its detail via the keyboard-operable toggle", async ({ page }) => {
  await page.goto("/observatory");
  const activity = page.getByRole("button", { name: /Activity/i });
  await expect(activity).toHaveAttribute("aria-expanded", "false"); // calm default = collapsed
  await activity.click();
  await expect(activity).toHaveAttribute("aria-expanded", "true");
});
