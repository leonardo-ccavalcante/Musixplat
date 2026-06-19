import { describe, expect, it } from "vitest";
import { parseTicketCsv, parseConversationCsv } from "./situationCsv";

// The Situation Room maps an operator CSV into the intake's typed rows. Mode 1 = structured tickets; Mode 2 =
// the n8n chat-history export (message column is JSON {type:human|ai, content}). Pure + testable; the spine
// runs on whatever the file says (never the fixed scenario).
describe("parseTicketCsv", () => {
  it("maps situation rows, coercing opened_ticket to bool and dropping blanks", () => {
    const text = [
      "restaurant_id,zone,payment_status,opened_ticket,intent,criticality,message",
      'R-1,Centro,failed,true,billing,critical,"payout missing"',
      "R-2,Norte,failed,false,,,",
    ].join("\n");
    const rows = parseTicketCsv(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      restaurant_id: "R-1",
      zone: "Centro",
      payment_status: "failed",
      opened_ticket: true,
      intent: "billing",
      criticality: "critical",
      message: "payout missing",
    });
    expect(rows[1]!.opened_ticket).toBe(false);
    expect(rows[1]!.intent).toBeUndefined();
    expect(rows[1]!.message).toBeUndefined();
  });

  it("defaults an unknown payment_status to failed and skips rows with no restaurant_id", () => {
    const rows = parseTicketCsv("restaurant_id,payment_status\nR-9,weird\n,failed");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.payment_status).toBe("failed");
  });
});

describe("parseConversationCsv (n8n chat-history)", () => {
  const text = [
    "id,session_id,message,created_at",
    '1,5699,"{""type"": ""human"", ""content"": ""hola""}",2025-08-18',
    '2,5699,"{""type"": ""ai"", ""content"": ""hola! como ayudo?""}",2025-08-18',
    '3,5700,"{""type"": ""human"", ""content"": ""tengo un problema""}",2025-08-18',
  ].join("\n");

  it("groups by session and maps human->restaurant, ai->agent, preserving turn order", () => {
    const convs = parseConversationCsv(text);
    expect(convs).toHaveLength(2);
    const s1 = convs.find((c) => c.session_id === "5699")!;
    expect(s1.turns).toHaveLength(2);
    expect(s1.turns[0]).toEqual({ role: "restaurant", text: "hola" });
    expect(s1.turns[1]).toEqual({ role: "agent", text: "hola! como ayudo?" });
    const s2 = convs.find((c) => c.session_id === "5700")!;
    expect(s2.turns).toHaveLength(1);
    expect(s2.turns[0]!.role).toBe("restaurant");
  });
});
