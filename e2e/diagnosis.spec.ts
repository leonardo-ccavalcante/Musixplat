import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// E2E + a11y for 05B (Support · Diagnosis). The dev stack is started by playwright's webServer; the local
// supabase db must be up with the 05B scenario (pnpm db:05b). Exercises the REAL flow end-to-end: the
// produced reverse-cascade (someone → affected / silent → R$) and the 11-field dossier gate. Numbers come
// from the producers (fn_hunt_silent + fn_impact_revenue_lost), never seeded.

test("@a11y Diagnosis renders the reverse-cascade + dossier + passes axe (WCAG 2.1 AA)", async ({ page }) => {
  await page.goto("/diagnosis");
  await expect(page.getByRole("heading", { name: "Support · Diagnosis" })).toBeVisible();

  // The silent-cascade hero loads with the PRODUCED counts (47 affected / 35 silent in the scenario).
  const hero = page.getByRole("region", { name: "Silent cascade" });
  await expect(hero).toBeVisible({ timeout: 20_000 });
  await expect(hero.getByText("47")).toBeVisible();
  await expect(hero.getByText("35")).toBeVisible();
  await expect(page.getByRole("region", { name: "Diagnosed" })).toBeVisible();

  await page.screenshot({ path: "test-results/diagnosis.png", fullPage: true });

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
});

test("opening the dossier shows the 11-field gate (honest partial)", async ({ page }) => {
  await page.goto("/diagnosis");
  await expect(page.getByRole("region", { name: "Silent cascade" })).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: /Open dossier/i }).first().click();
  const dialog = page.getByRole("dialog", { name: /Dossier #8/i });
  await expect(dialog).toBeVisible();
  // the gate verdict + at least one field label render (partial is honest — churn gap).
  await expect(dialog.getByText(/Type & root/i)).toBeVisible();
  await expect(dialog.getByText(/Partial|Complete/)).toBeVisible();
  await page.screenshot({ path: "test-results/diagnosis-dossier.png", fullPage: true });
});
