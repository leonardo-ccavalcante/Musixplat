import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fileURLToPath } from "node:url";

// P06 E2E — the operator's loop, end-to-end in the product:
//   1. Upload a real policy.md to the knowledge base; the AI PROPOSES a type; the human CONFIRMS it.
//   2. Run a payment case on /diagnosis; the spine grounds the answer in the base (B.6.5).
//   3. The generated artifact CITES its source — `Sources: policy.md (…)` is visible in the artifact viewer.
// The dev stack is started by playwright's webServer; the local supabase db must be up with the 05B
// scenario (pnpm db:05b) so R-PAY-001 diagnoses to a complete dossier → artifact. /knowledge and
// /diagnosis both dev-login as U-PAY-001 (POOL-PAY), so the uploaded doc and the case share a tenant.
// In the live server the real text-embedding-3-small embedder runs (key present), so a refund/payment
// policy semantically matches the payment case — the citation is produced, never seeded.

const POLICY = fileURLToPath(new URL("./fixtures/policy.md", import.meta.url));

// The live path calls the real text-embedding-3-small + (optional) LLM classifier, so the upload +
// run-flow steps are network-bound — give the whole flow generous headroom (well above the 30s default).
test.setTimeout(180_000);

test("@a11y upload policy.md → confirm type → run a case → dossier cites the source", async ({ page }) => {
  // ── 1. Upload + confirm on the Knowledge Base screen ──────────────────────────────────────────
  await page.goto("/knowledge");
  await expect(page.getByRole("heading", { name: "Knowledge Base" })).toBeVisible();

  await page.getByRole("button", { name: /Upload document/i }).click();
  const dialog = page.getByRole("dialog", { name: /Add a document/i });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel(/File \(PDF, Markdown or text\)/i).setInputFiles(POLICY);

  // AI proposes a type; the confirm step appears. Confirm it as "Policy" (human [V]).
  await expect(dialog.getByText(/AI proposed/i)).toBeVisible({ timeout: 60_000 });
  await dialog.getByLabel(/Document type/i).selectOption("Policy");
  await dialog.getByRole("button", { name: /^Confirm$/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  // The doc is now in the base — it shows in the document list as confirmed Policy.
  await expect(
    page.getByRole("region", { name: "Documents" }).getByText("policy.md").first(),
  ).toBeVisible({ timeout: 15_000 });

  // ── 2. Run a payment case on the Diagnosis screen ─────────────────────────────────────────────
  await page.goto("/diagnosis");
  await expect(page.getByRole("heading", { name: "Support · Diagnosis" })).toBeVisible();

  const runBtn = page.getByRole("button", { name: /^Run flow$/i });
  await expect(runBtn).toBeEnabled({ timeout: 20_000 });
  await runBtn.click();

  // The run reports → diagnoses → (complete dossier ⇒) generates an artifact. Wait for the outcome line.
  const runStatus = page.getByText(/Diagnosed ·|Fail-closed:/i);
  await expect(runStatus).toBeVisible({ timeout: 60_000 });
  await expect(runStatus).toContainText(/artifact ready for review|artifact/i);

  // ── 3. Open the artifact and assert the SOURCE CITATION is shown ──────────────────────────────
  // Open the most recent artifact from the queue (the produced one for the payment case).
  const queue = page.getByRole("region", { name: /Artifacts.*needs your decision/i });
  await expect(queue).toBeVisible({ timeout: 15_000 });
  await queue.getByRole("button", { name: /^Open$/i }).first().click();
  const artifact = page.getByRole("dialog", { name: /Artifact · review/i });
  await expect(artifact).toBeVisible({ timeout: 15_000 });

  // The citation region renders the produced `Sources: policy.md (Policy)` line, stamped [C].
  const sources = artifact.getByRole("region", { name: "Sources" });
  await expect(sources).toBeVisible();
  await expect(sources).toContainText("policy.md");

  await page.screenshot({ path: "test-results/knowledge-citation.png", fullPage: true });

  // a11y — the artifact viewer (modal) passes axe at WCAG 2.1 AA (focus-trap + aria-modal via Modal).
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
});
