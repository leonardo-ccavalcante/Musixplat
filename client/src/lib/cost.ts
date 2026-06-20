// AI Cost panel formatters (P07). Pure + display-only — the numbers come from gov.v_llm_cost (SQL).

/** USD with honest precision: null ⇒ "—" (unknown/unpriced, never fake $0); sub-cent ⇒ 4 decimals so a
 *  tiny per-ticket cost stays visible; otherwise 2 decimals. */
export function formatUsd(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n > 0 && n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

/** Compact token count: raw under 1k, "k" under 1M, "M" above. */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}
