// P06 NBA tie-in — a TEXT signal (§3.3/§3.6): the knowledge base holds a Policy/Terms doc relevant to
// this NBA, so a human should review it before release. It NEVER moves a number or auto-changes the
// autonomy level — the human still decides. Non-color-only (icon + text, WCAG 2.1 AA, CLAUDE.md §4):
// the badge always carries the literal "Review · KB" label and a redundant ✦ glyph, so colour-blind
// and high-contrast users get the same signal. Presentational: the page supplies `shouldReview`
// (fail-closed — undefined/false renders nothing, so loading/error never shows a false signal).
export function KbReviewBadge({ shouldReview, note }: { shouldReview?: boolean; note?: string | null }) {
  if (!shouldReview) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-mxm border border-mxm-border px-2 py-0.5 text-xs font-medium text-mxm-amber"
      title={note ?? undefined}
    >
      <span aria-hidden>✦</span> Review · KB
    </span>
  );
}
