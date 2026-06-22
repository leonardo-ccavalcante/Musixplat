import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { parseTicketCsv, parseConversationCsv } from "./situationCsv";
import { redactPII } from "../../../../server/pieces/pii";

// Proof the shipped Situation Room samples ACTUALLY ingest (not just parse): they clear the two real upload
// gates — (1) the client parser (situationCsv.ts: payment_status/order_date/fee≤gross/intent), and (2) the
// server PII redactor (stage.ts blocks an upload on residual PII in any message, and rejects a restaurant_id
// or zone that carries ANY PII type). If this is green, the operator's upload of these files will not 400.
const read = (name: string): string => readFileSync(resolve(process.cwd(), "samples", name), "utf8");

describe("Situation Room sample data — upload-safe at volume", () => {
  it("tickets: ≥300 rows parse, and every label + message clears the server gates", () => {
    const rows = parseTicketCsv(read("situation-tickets.csv"));
    expect(rows.length).toBeGreaterThanOrEqual(300);
    expect(rows.some((r) => r.payment_status === "failed")).toBe(true); // fuels the cascade
    for (const r of rows) {
      expect(r.fee).toBeLessThanOrEqual(r.gross_value);
      expect(redactPII(r.restaurant_id).tipos.length).toBe(0); // assertPiiFreeLabel passes
      expect(redactPII(r.zone).tipos.length).toBe(0);
      if (r.message) expect(redactPII(r.message).residualPII).toBe(false); // upload not blocked
    }
  });

  it("conversations: ≥1000 sessions parse (n8n JSON), every turn clears the PII gate", () => {
    const convs = parseConversationCsv(read("situation-conversations.csv"));
    expect(convs.length).toBeGreaterThanOrEqual(1000);
    expect(convs.every((c) => c.turns.length > 0)).toBe(true);
    expect(convs.some((c) => c.turns.some((t) => t.role === "agent"))).toBe(true); // the ai turns parsed
    for (const c of convs) for (const t of c.turns) expect(redactPII(t.text).residualPII).toBe(false);
  });
});
