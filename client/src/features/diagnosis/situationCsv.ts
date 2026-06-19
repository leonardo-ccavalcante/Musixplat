import { csvToRecords } from "@/lib/csv";
import type { TicketRowInput, UploadConversationsInput } from "@shared/contracts_intake";

// Map an operator CSV into the intake's typed rows. Mode 1 = structured tickets. Mode 2 = the n8n
// chat-history export (the `message` column is a JSON object {type:human|ai, content}). Pure + defensive:
// a bad cell degrades to a sane default, never throws — the spine then runs on whatever the file says.
const PAY = new Set(["failed", "ok", "pending"]);
const CRIT = new Set(["critical", "moderate", "low"]);
const truthy = (v: string | undefined): boolean => /^(true|1|yes|y)$/i.test((v ?? "").trim());

export function parseTicketCsv(text: string): TicketRowInput[] {
  return csvToRecords(text)
    .filter((r) => (r.restaurant_id ?? "").trim() !== "")
    .map((r) => {
      const ps = (r.payment_status ?? "").trim();
      const crit = (r.criticality ?? "").trim();
      return {
        restaurant_id: (r.restaurant_id ?? "").trim(),
        zone: r.zone || "Centro",
        payment_status: (PAY.has(ps) ? ps : "failed") as TicketRowInput["payment_status"],
        opened_ticket: truthy(r.opened_ticket),
        intent: r.intent || undefined,
        criticality: (CRIT.has(crit) ? crit : undefined) as TicketRowInput["criticality"],
        message: r.message || undefined,
      };
    });
}

type Conversation = UploadConversationsInput["conversations"][number];

export function parseConversationCsv(text: string): Conversation[] {
  const bySession = new Map<string, Conversation>();
  for (const r of csvToRecords(text)) {
    const sid = (r.session_id ?? "").trim();
    if (sid === "") continue;
    let conv = bySession.get(sid);
    if (!conv) {
      conv = { session_id: sid, turns: [] };
      bySession.set(sid, conv);
    }
    // n8n LangChain memory: message is JSON {type:"human"|"ai", content}. Fall back to the raw cell.
    let role: "restaurant" | "agent" = "restaurant";
    let content = (r.message ?? "").trim();
    try {
      const m = JSON.parse(r.message ?? "") as { type?: unknown; content?: unknown };
      if (m && typeof m === "object") {
        role = m.type === "ai" ? "agent" : "restaurant";
        content = typeof m.content === "string" ? m.content : content;
      }
    } catch {
      /* not JSON — treat the raw cell as a restaurant turn */
    }
    if (content) conv.turns.push({ role, text: content });
  }
  return [...bySession.values()].filter((c) => c.turns.length > 0);
}
