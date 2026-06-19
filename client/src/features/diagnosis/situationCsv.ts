import { csvToRecords } from "@/lib/csv";
import type { TicketRowInput, UploadConversationsInput } from "@shared/contracts_intake";

// Map an operator CSV into the intake's typed rows. Mode 1 = structured tickets. Mode 2 = the n8n
// chat-history export (the `message` column is a JSON object {type:human|ai, content}). Fail-closed:
// invalid financial/status cells reject the upload instead of silently manufacturing business inputs.
const PAY = new Set(["failed", "ok", "pending"]);
const CRIT = new Set(["critical", "moderate", "low"]);
const truthy = (v: string | undefined): boolean => /^(true|1|yes|y)$/i.test((v ?? "").trim());
const requiredNumber = (value: string | undefined, field: string): number => {
  const raw = (value ?? "").trim();
  const n = Number(raw);
  if (raw === "" || !Number.isFinite(n) || n < 0) throw new Error(`${field} must be a non-negative number`);
  return n;
};

export function parseTicketCsv(text: string): TicketRowInput[] {
  return csvToRecords(text)
    .filter((r) => (r.restaurant_id ?? "").trim() !== "")
    .map((r) => {
      const ps = (r.payment_status ?? "").trim();
      const crit = (r.criticality ?? "").trim();
      const orderDate = (r.order_date ?? "").trim();
      if (!PAY.has(ps)) throw new Error(`invalid payment_status for ${r.restaurant_id}`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) throw new Error(`invalid order_date for ${r.restaurant_id}`);
      const grossValue = requiredNumber(r.gross_value, "gross_value");
      const fee = requiredNumber(r.fee, "fee");
      if (fee > grossValue) throw new Error(`fee cannot exceed gross_value for ${r.restaurant_id}`);
      return {
        restaurant_id: (r.restaurant_id ?? "").trim(),
        zone: r.zone || "Centro",
        payment_status: ps as TicketRowInput["payment_status"],
        order_date: orderDate,
        gross_value: grossValue,
        fee,
        opened_ticket: truthy(r.opened_ticket),
        intent: r.intent || undefined,
        criticality: (CRIT.has(crit) ? crit : undefined) as TicketRowInput["criticality"],
        message: r.message || undefined,
        resolution_how: r.resolution_how || undefined,
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
