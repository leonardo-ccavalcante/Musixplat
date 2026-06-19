import { describe, expect, it } from "vitest";
import { gmailComposeUrl, previewDoc } from "./dossierEmail";
import type { DossierData } from "./dossierMemo";
import type { DiagnosisListRow } from "@shared/contracts_05b";

// 05C dossier handoff — Leo: "Send via mail client" must open GMAIL (not the OS default), and the email CTA
// "Open the full dossier" must open the generated PDF memo (not navigate to /diagnosis). Both are pure,
// testable builders; numbers come from the dossier, nothing invented.
const row: DiagnosisListRow = {
  problem_id: "p1",
  restaurant_id: "R-PAY-001",
  status: "open",
  origin: "reactive",
  needs_human: false,
  criticality: "critical",
  area_type: "finance",
  hypothesis_root: "payment was not executed",
  confidence: 0.6,
  affected: 47,
  silent: 35,
  silent_status: "evaluable",
  revenue_lost: 3760,
  suggested_route: "fix_internal",
  frequency: 1,
  first_seen_ts: "2026-06-19T00:00:00Z",
};
const d: DossierData = { emitted: true, gaps: [], fields: { f5_how_much: { revenue_lost: 3760 } } };

describe("dossierEmail — Gmail compose + PDF CTA", () => {
  it("gmailComposeUrl builds a Gmail compose deep-link with subject + body pre-filled", () => {
    const url = gmailComposeUrl("Support dossier: R & D", "line one\nline two");
    expect(url).toMatch(/^https:\/\/mail\.google\.com\/mail\/\?/);
    expect(url).toContain("view=cm");
    expect(url).toContain("su=Support+dossier%3A+R+%26+D"); // subject encoded
    expect(url).toContain("body=line+one%0Aline+two"); // body encoded (newline preserved)
  });

  it("previewDoc wires Send-via-Gmail to the Gmail URL", () => {
    const html = previewDoc(row, d, "2026-06-19", {
      dossierUrl: "blob:DOSSIER",
      gmailUrl: "https://mail.google.com/mail/?view=cm&su=x",
      mailtoUrl: "mailto:?subject=x",
    });
    expect(html).toContain("Send via Gmail");
    expect(html).toContain('href="https://mail.google.com/mail/?view=cm&su=x"');
  });

  it("previewDoc points the email CTA at the generated dossier PDF (not /diagnosis)", () => {
    const html = previewDoc(row, d, "2026-06-19", {
      dossierUrl: "blob:DOSSIER",
      gmailUrl: "https://mail.google.com/mail/?view=cm",
      mailtoUrl: "mailto:?subject=x",
    });
    expect(html).toContain("Open the full dossier");
    expect(html).toContain('href="blob:DOSSIER"'); // the CTA opens the PDF memo
    expect(html).not.toContain("/diagnosis"); // never navigates back to the app screen
  });
});
