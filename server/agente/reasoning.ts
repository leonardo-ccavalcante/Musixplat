// 02:1A reasoning seam. The engine selects WHICH lever via a ReasoningProvider; the NUMBER is always
// SQL (cohort.fn_nba_test, §8/§14) — the provider only ranks/selects and writes TEXT. Two providers:
//   - deterministicReasoning (here): worst-relative-gap problem; reproducible, no LLM, testable E2E.
//   - (future) an LLM provider doing real /problem-solving + /sat — plugs into this SAME interface,
//     still calling fn_nba_test for every number. Tests inject a stub so CI stays deterministic.

export interface NbaVerdict {
  action_code: string;
  dimension: string | null;
  measured: number | null;
  standard: number | null;
  verdict: string; // 'below' | 'ok' | 'above' | 'no_data'
  gap: number | null;
  within_range: boolean;
  n_min_ok: boolean | null;
  k_anon_ok: boolean | null;
}

export interface NbaSelection {
  ranked: string[]; // ≤3 candidate action_codes, worst-first (the bounded hypothesis set)
  lever: NbaVerdict | null; // the chosen lever (null ⇒ no attributable cause ⇒ escalate / A8)
  rootCause: string; // [C] text bounded by the verdict (never asserts a number fn_nba_test didn't return)
}

export interface NbaReasoning {
  select(verdicts: NbaVerdict[]): NbaSelection;
}

// A signal is a "problem" only when it is out of range (below/above per its catalog sense) with a real
// number — never on 'ok' or 'no_data' (§14 fail-closed). Severity = relative gap |gap|/|standard| so
// dimensions on different scales (connection 0-1 vs price 0-100) compare fairly. A zero standard ⇒ any
// breach is maximal (Infinity) so it ranks WORST — it is NEVER silently dropped, else the AGENTE would
// contradict an SQL verdict that DID attribute a cause (§8). Comparator is NaN-safe: equal severities
// (including Infinity===Infinity) fall through to the action_code tiebreak ⇒ total, deterministic order.
const severity = (v: NbaVerdict): number =>
  v.standard === 0 ? Infinity : Math.abs(v.gap!) / Math.abs(v.standard!);

export const deterministicReasoning: NbaReasoning = {
  select(verdicts: NbaVerdict[]): NbaSelection {
    const problems = verdicts
      .filter(
        (v) => (v.verdict === "below" || v.verdict === "above") && v.standard != null && v.gap != null,
      )
      .sort((a, b) => {
        const sa = severity(a);
        const sb = severity(b);
        return sa === sb ? a.action_code.localeCompare(b.action_code) : sb - sa;
      });

    const ranked = problems.slice(0, 3).map((v) => v.action_code); // HARD CAP 3 (cost discipline)
    const lever = problems[0] ?? null;
    const rootCause = lever
      ? `${lever.dimension} ${lever.verdict} standard (measured=${lever.measured}, standard=${lever.standard}, gap=${lever.gap})`
      : "no attributable cause — all funnel dimensions within range or no_data";
    return { ranked, lever, rootCause };
  },
};
