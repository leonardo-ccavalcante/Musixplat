// EPIC-B4 coach onboarding — pure format helpers for the golden-set upload (no trpc, no DOM, fully testable).
// The operator authors their OWN answer key (INPUT [V], §14): for each real cohort member they write the
// CORRECT next-best-action (A1..A8). These make the CSV self-explanatory in a spreadsheet and parse it back
// leniently; the server (eval.authorFromTemplate) stays the fail-closed validator of membership/duplicates.

// Closed reference catalog mirrored from catalog."Intent_Catalog" (supabase/seed.sql) — NOT a §14 result,
// so it is safe as a client constant for the topic picker (same pattern as nbaCatalog.ts / NBA_CATALOG).
export const INTENT_CATALOG: readonly { intent_id: string; label: string }[] = [
  { intent_id: "billing", label: "Billing / payments" },
  { intent_id: "delivery", label: "Delivery" },
  { intent_id: "quality", label: "Quality" },
  { intent_id: "promo", label: "Promotions" },
  { intent_id: "menu", label: "Menu issues" },
  { intent_id: "order_review", label: "Order review" },
  { intent_id: "cancellation", label: "Order cancellation" },
];

export interface GoldenRow {
  restaurantId: string;
  correctLabel: string;
}

const LABEL_RE = /^A[1-8]$/;

// A downloadable CSV that explains itself: a commented legend (so an operator who opens it in Excel sees the
// valid labels), the machine header, then one row per real member with the label column LEFT BLANK to fill.
// `legend` is the short "A1 — Increase connection" list, built by the caller from NBA_CATALOG (§14-safe ref).
export function csvTemplate(restaurantIds: string[], legend: string[]): string {
  const header = [
    "# Golden set — your answer key for this cohort.",
    "# In the correct_label column put ONE code (A1..A8): the RIGHT next-best-action for that restaurant.",
    ...legend.map((l) => `#   ${l}`),
    "# Lines starting with # are ignored. Keep the header row and do not change restaurant_id.",
  ];
  const body = ["restaurant_id,correct_label", ...restaurantIds.map((r) => `${r},`)];
  return [...header, ...body].join("\n") + "\n";
}

// Lenient parse: drop blank + '#' comment lines, drop the header, keep rows whose label is a valid A1..A8
// (case-insensitive). Membership / duplicate / cross-pool checks are the server's job (fail-closed), not here.
export function parseGoldenCsv(text: string): GoldenRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  return lines
    .slice(1) // drop the header row
    .map((l) => l.split(","))
    .map((c) => ({ restaurantId: (c[0] ?? "").trim(), correctLabel: (c[1] ?? "").trim().toUpperCase() }))
    .filter((r) => r.restaurantId && LABEL_RE.test(r.correctLabel));
}

// Human label for a cohort <option> (cuisine · zone · tier); falls back to the opaque id when descriptors
// are absent, so the operator never has to type a cohort id from memory again.
export function cohortOptionLabel(c: {
  cohort_id: string;
  cuisine: string | null;
  zone: string | null;
  tier_base?: string | null;
}): string {
  const parts = [c.cuisine, c.zone, c.tier_base].filter(Boolean);
  return parts.length ? parts.join(" · ") : c.cohort_id;
}
