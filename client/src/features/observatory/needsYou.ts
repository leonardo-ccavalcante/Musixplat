// "Needs you" aggregation — what awaits the operator RIGHT NOW, derived from EXISTING reads (zero new
// backend): sign-off = the Cockpit's needs_human NBAs (the release/pause queue the AI could NOT auto-clear;
// money = reason 'money'); lessons = draft learned cases awaiting the operator's OK (not yet vetted AND not
// auto-verified). Pure + total-driven so the bar can render an honest calm state when nothing pends. This
// only SURFACES counts and links through to the existing Cockpit / review queue — it never re-implements
// those flows (read-through, §8).
export type NeedsYouCounts = { signOff: number; money: number; lessons: number; total: number };

export function computeNeedsYou(
  cockpitRows: ReadonlyArray<{ status: string; reason: string | null }> | undefined,
  learningCases: ReadonlyArray<{ reviewed: boolean; verificationStatus: string | null }> | undefined,
): NeedsYouCounts {
  const signOffRows = (cockpitRows ?? []).filter((r) => r.status === "needs_human");
  const signOff = signOffRows.length;
  const money = signOffRows.filter((r) => r.reason === "money").length;
  // A lesson needs the operator only while it is neither vetted (reviewed) nor auto-verified (verified_fixed
  // mints a [V] lesson without a human OK, 05D Part D) — mirror LearningTier's "awaiting your OK" gate.
  const lessons = (learningCases ?? []).filter(
    (c) => !c.reviewed && c.verificationStatus !== "verified_fixed",
  ).length;
  return { signOff, money, lessons, total: signOff + lessons };
}
