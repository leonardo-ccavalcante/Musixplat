// 02:§1A — the closed NBA action set (A1–A8). Reference data mirrored from catalog."NBA_Catalogo"
// (supabase/seed.sql): closed, not a §14 result, so it is safe as a client constant for the
// "What are these actions?" glossary and the by-action grouping labels. The LIVE per-action catalog
// row + track record is read server-side by nba.detail and shown on /cockpit/action/:code.
export interface NbaCatalogEntry {
  code: string;
  name: string;
  stage: string;
  money: boolean;
  desc: string;
}

export const NBA_CATALOG: readonly NbaCatalogEntry[] = [
  { code: "A1", name: "Increase connection", stage: "availability", money: false, desc: "Nudge the restaurant to connect its committed hours — be online when it said it would be." },
  { code: "A2", name: "Review price vs peers", stage: "attractiveness", money: false, desc: "Surface a price recommendation vs cohort peers. Proposal only — never changes price automatically." },
  { code: "A3", name: "Propose promo/bonus", stage: "attractiveness", money: true, desc: "Propose a promo or bonus to lift attractiveness. The AI proposes; a human releases the money." },
  { code: "A4", name: "Improve menu", stage: "attractiveness", money: false, desc: "A menu-quality checklist (photos + descriptions) when quality is the gap." },
  { code: "A5", name: "Stimulate local demand", stage: "demand", money: false, desc: "Signal local growth/marketing when demand dropped in the zone — not the restaurant's fault." },
  { code: "A6", name: "Resolve cancellation ops", stage: "fulfillment", money: false, desc: "Open an operations ticket for the cause behind restaurant-side cancellations." },
  { code: "A7", name: "Investigate fraud/risk", stage: "integrity", money: true, desc: "Escalate to a human risk/fraud review when a customer-cancel pattern looks like abuse. Money at stake." },
  { code: "A8", name: "Observation (no action)", stage: "fallback", money: false, desc: "Fail-closed: no attributable cause found — the AI does not invent one. It watches instead." },
];

// code → human label, for the by-action grouping titles (falls back to the raw code if unknown).
export const NBA_LABEL: Record<string, string> = Object.fromEntries(NBA_CATALOG.map((e) => [e.code, e.name]));
