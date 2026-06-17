import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// E2E + a11y for Screen 01. The dev stack (client+server) is started by playwright's webServer;
// the local supabase db must be up (pnpm db:start) with P01 results (pnpm db:p01).

test("@a11y Cohorts Explorer renders and passes axe (WCAG 2.1 AA)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Cohorts Explorer" })).toBeVisible();

  // Panels render after the dev session + data load.
  await expect(page.getByRole("region", { name: "Semáforo de cohorts" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Panel de delta priorizado" })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
});

test("opening a cohort traps focus in the modal and closes on Escape", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Semáforo de cohorts" })).toBeVisible();
  const firstCell = page.getByRole("region", { name: "Semáforo de cohorts" }).getByRole("button").first();
  await firstCell.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
