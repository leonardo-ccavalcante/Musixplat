// Generate the two Situation Room upload files that ACTUALLY ingest (matched to situationCsv.ts +
// stage.ts contracts): tickets (≥300, payment_status drives the cascade) and conversations (≥1000
// sessions, n8n LangChain export format). 3 cases each. PII-free (no names/emails/phones) so the
// server redactor never blocks the upload. Run: pnpm exec tsx scripts/gen_intake_samples.ts
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = new URL("../samples/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const ZONES = ["Centro", "Norte", "Sur", "Este", "Oeste"];
const pad = (n: number, w = 4): string => String(n).padStart(w, "0");
const csv = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const day = (i: number): string => `2026-06-${pad((i % 21) + 1, 2)}`; // spread across a recent 3-week window

// ── 3 ticket cases (area is classified from intent+message; payment_status='failed' fuels the cascade) ──
const TICKET_CASES = [
  { intent: "billing", crit: "critical",
    msgs: ["My weekly payout never arrived even though customers paid at checkout.",
           "Several orders show paid on the customer side but nothing settled to my balance."] },
  { intent: "cancellation", crit: "moderate",
    msgs: ["Orders keep getting cancelled at peak because the kitchen is overloaded.",
           "We are rejecting orders when items run out and the menu is not synced."] },
  { intent: "quality", crit: "low",
    msgs: ["Customers say the photos do not match what actually arrives.",
           "The app still lists dishes we removed from the menu weeks ago."] },
];

function genTickets(n: number): string {
  const head = "restaurant_id,zone,payment_status,order_date,gross_value,fee,opened_ticket,intent,criticality,message,resolution_how";
  const lines = [head];
  for (let i = 0; i < n; i++) {
    const c = i % 3; // case 0=finance · 1=operations · 2=quality
    const kase = TICKET_CASES[c]!;
    const zone = ZONES[i % ZONES.length]!;
    const pay = c === 2 ? (i % 7 === 0 ? "pending" : "ok") : "failed"; // cases 0/1 feed the failed-payment cascade
    const gross = 60 + (i % 140);
    const fee = 10 + (i % 25); // always <= gross
    const opened = i % 4 === 0; // ~25% open a ticket (a redactable restaurant turn + intent)
    const msg = opened ? kase.msgs[i % kase.msgs.length]! : "";
    const how = c === 0 && i % 40 === 0 ? "gateway retry + manual reissue" : ""; // a few reviewed KB fixes
    lines.push([
      `R-SIT-${pad(i)}`, zone, pay, day(i), gross, fee, opened ? "true" : "false",
      opened ? kase.intent : "", opened ? kase.crit : "", msg, how,
    ].map((v) => csv(String(v))).join(","));
  }
  return lines.join("\n") + "\n";
}

// ── 3 conversation cases (n8n LangChain memory: message = JSON {type:human|ai, content}) ──
const CONV_CASES: ReadonlyArray<ReadonlyArray<readonly [string, string]>> = [
  [["human", "My weekly payout never arrived even though customers paid."],
   ["ai", "I am checking the settlement now. Which is your restaurant?"],
   ["human", "It has been three days with nothing on my balance."]],
  [["human", "My order shows cancelled but the customer already paid."],
   ["ai", "Let me look into the cancellation and the refund status."]],
  [["human", "Customers complain the dish does not match the photo."],
   ["ai", "Thanks for flagging — I will review the menu listing."],
   ["human", "Please also fix the items we removed last week."]],
];

function genConversations(sessions: number): string {
  const head = "id,session_id,message,created_at";
  const lines = [head];
  let id = 1;
  for (let s = 0; s < sessions; s++) {
    const turns = CONV_CASES[s % 3]!;
    const sid = 10000 + s;
    for (let t = 0; t < turns.length; t++) {
      const [type, content] = turns[t]!;
      const json = JSON.stringify({ type, content });
      const min = pad((s * 2 + t) % 60, 2);
      const ts = `2026-06-${pad((s % 21) + 1, 2)} 1${t % 5}:${min}:00+00`;
      lines.push([String(id++), String(sid), csv(json), ts].join(","));
    }
  }
  return lines.join("\n") + "\n";
}

const tickets = genTickets(330);
const conversations = genConversations(1050);
writeFileSync(new URL("situation-tickets.csv", OUT), tickets);
writeFileSync(new URL("situation-conversations.csv", OUT), conversations);
console.warn(`tickets rows: ${tickets.trim().split("\n").length - 1}`);
console.warn(`conversation rows: ${conversations.trim().split("\n").length - 1} (across 1050 sessions)`);
