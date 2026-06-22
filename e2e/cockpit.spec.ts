import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// E2E + a11y for Screen 02 (Autonomy Cockpit). The dev stack is started by playwright's webServer; the
// local supabase db must be up with P02 data (pnpm db:p02). Exercises the REAL flow end-to-end: AI-proposed
// NBAs → autonomy verdict (AUTO vs needs-human) → a human Release that records a Decision_Trace.

test("@a11y Autonomy Cockpit renders proposals + verdicts + passes axe (WCAG 2.1 AA)", async ({ page }) => {
  await page.goto("/cockpit");
  await expect(page.getByRole("heading", { name: "Autonomy Cockpit" })).toBeVisible();

  // Proposals load (the hero posture + the grouped queue), and both verdicts appear on the board.
  await expect(page.getByRole("region", { name: "Fleet autonomy posture" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/AUTO · AI acts alone/).first()).toBeVisible();
  await expect(page.getByText(/Needs human/).first()).toBeVisible();

  await page.screenshot({ path: "test-results/cockpit.png", fullPage: true });

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
});

test("a human Release records a Decision_Trace (shows the trace id)", async ({ page }) => {
  await page.goto("/cockpit");
  await expect(page.getByRole("region", { name: "Fleet autonomy posture" })).toBeVisible({ timeout: 20_000 });

  // needs-human groups (money/level/gate) are open by default → the first Release is reachable.
  const release = page.getByRole("button", { name: "Release" }).first();
  await expect(release).toBeVisible();
  await release.click();
  await expect(page.getByText(/Released ✓ trace/).first()).toBeVisible({ timeout: 10_000 });
});

// 02:CP — "View cohort in Cockpit" focus (?focus=<cohort>). Alt 1 = guide the eye, never narrow the board.
// Deterministic case: a cohort that isn't on the board ⇒ the honest "not generated yet" cue (never a blank),
// and the normal board is still rendered (not filtered). The PRESENT-cohort highlight is unit-tested on the
// board (CockpitBoard.test.tsx: data-focused) + the cue (CockpitFocusCue.test.tsx).
test("?focus= shows an honest cue for an absent cohort and does NOT narrow the board", async ({ page }) => {
  await page.goto("/cockpit?focus=__no_such_cohort__");
  await expect(page.getByRole("region", { name: "Fleet autonomy posture" })).toBeVisible({ timeout: 20_000 });

  // the page read the focus param and rendered the honest cue (§14: never a blank). The distinctive
  // "No proposal for cohort <id>" text uniquely identifies the absent-cue (the cue also names the producer to
  // run, but "Run NBA" also matches the hero's run button, so we assert the unambiguous cohort line instead).
  await expect(page.getByText(/No proposal for cohort/i)).toBeVisible();
  await expect(page.getByText("__no_such_cohort__")).toBeVisible();

  // the cue is dismissible via "Show all" (clears the param). It renders regardless of board data, so this
  // assertion is deterministic. ("Board not narrowed" is unit-tested on CockpitBoard — it asserts unfocused
  // rows still render — without needing a seeded DB, so it isn't re-asserted here.)
  await expect(page.getByRole("button", { name: "Show all" })).toBeVisible();
});
