// Deterministic, dimension-aware display of a measured signal. The NUMBER is produced by SQL
// (fn_nba_test, §3.6/§14); here we only ROUND it and give it its natural unit so every screen — the
// cockpit list, the NBA modal, the dispatch artifact — reports the same value the same way. Never
// mutates the stored full-precision value (§3.10 no false precision). Used by both client and server.

export type SignalUnit = "rate" | "pctile" | "money";

// dimension (the fn_nba_test signal column) → its natural unit + a human label. Rates live on 0-1 and
// render as %; price_pctile_in_cohort is already 0-100. "money" is listed for forward-compatibility —
// a €-denominated signal — but slice-2 has none yet; an unknown dimension falls back to rate.
const DIMENSION: Record<string, { unit: SignalUnit; label: string }> = {
  m_connection: { unit: "rate", label: "Connection ratio" },
  m_quality: { unit: "rate", label: "Quality score" },
  cancel_by_restaurant: { unit: "rate", label: "Restaurant-cancel rate" },
  cancel_by_customer: { unit: "rate", label: "Customer-cancel rate" },
  zone_demand_trend: { unit: "rate", label: "Zone-demand trend" },
  price_pctile_in_cohort: { unit: "pctile", label: "Price percentile vs peers" },
};

const round1 = (n: number): string => (Math.round(n * 10) / 10).toString();
const euro = (n: number): string => `€${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export function unitOf(dimension: string): SignalUnit {
  return DIMENSION[dimension]?.unit ?? "rate";
}
export function labelOf(dimension: string): string {
  return DIMENSION[dimension]?.label ?? dimension;
}

// A value in its dimension's unit. rate: 0.0833 → "8.3%". pctile: 82.5 → "82.5 pctile". money → "€12".
export function fmtValue(dimension: string, v: number): string {
  switch (unitOf(dimension)) {
    case "rate":
      return `${round1(v * 100)}%`;
    case "pctile":
      return `${round1(v)} pctile`;
    case "money":
      return euro(v);
  }
}

// A gap (signed difference). rate/pctile gaps are in percentage POINTS; money gaps in €.
export function fmtGap(dimension: string, gap: number): string {
  const sign = gap > 0 ? "+" : gap < 0 ? "−" : "";
  switch (unitOf(dimension)) {
    case "rate":
      return `${sign}${round1(Math.abs(gap) * 100)} pts`;
    case "pctile":
      return `${sign}${round1(Math.abs(gap))} pts`;
    case "money":
      return `${sign}${euro(gap)}`;
  }
}

export interface SignalEvidence {
  dimension: string;
  measured: number;
  standard: number;
  gap?: number;
}

// Parse the structured before_after_expected ([V] diagnosis). Returns null on a malformed payload so
// callers fall back to prose, never throw (§3.10 / §4 defensive render).
export function readSignal(j: unknown): SignalEvidence | null {
  if (j && typeof j === "object") {
    const o = j as Record<string, unknown>;
    if (typeof o.dimension === "string" && typeof o.measured === "number" && typeof o.standard === "number") {
      return {
        dimension: o.dimension,
        measured: o.measured,
        standard: o.standard,
        gap: typeof o.gap === "number" ? o.gap : undefined,
      };
    }
  }
  return null;
}

// One clean evidence line: "Customer-cancel rate 8.3% vs 5% standard · gap +3.3 pts". null if no signal.
export function evidenceLine(j: unknown): string | null {
  const s = readSignal(j);
  if (!s) return null;
  const gap = s.gap != null ? ` · gap ${fmtGap(s.dimension, s.gap)}` : "";
  return `${labelOf(s.dimension)} ${fmtValue(s.dimension, s.measured)} vs ${fmtValue(s.dimension, s.standard)} standard${gap}`;
}
