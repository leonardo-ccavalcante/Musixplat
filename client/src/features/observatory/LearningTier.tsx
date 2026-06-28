import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { AutonomyControls } from "@/features/cockpit/AutonomyControls";
import { CollapsibleTier } from "./CollapsibleTier";

const PREVIEW = 6;

// Learning = what the AI took from cases. One-line summary (N lessons · K needs your OK · M in use) opens to
// a list with the "why" on expand (cite-don't-assert). Vetting is `reviewed`; "in use" = verified_fixed (the
// only [V], 05D Part D). "resolved" reads green ONLY when its outcome provenance is [V] (§3.10). Approve/
// reject + Re-measure reuse the EXISTING surfaces (AutonomyControls queue · motor.verifyResolutions) — no new
// write code. Status is icon+text, never color-only.
export function LearningTier({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const cases = trpc.observatory.learningCases.useQuery({}, { enabled: true });
  const [reviewOpen, setReviewOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const rows = cases.data ?? [];
  const pending = rows.filter((c) => !c.reviewed && c.verificationStatus !== "verified_fixed").length;
  const inUse = rows.filter((c) => c.verificationStatus === "verified_fixed").length;

  const utils = trpc.useUtils();
  const remeasure = trpc.motor.verifyResolutions.useMutation({
    onSuccess: () => void utils.observatory.learningCases.invalidate(),
  });

  const summary = !cases.isSuccess
    ? "· …"
    : rows.length === 0
      ? "· nothing learned yet"
      : `· ${rows.length} lessons${pending > 0 ? ` · ${pending} needs your OK` : ""}${inUse > 0 ? ` · ${inUse} in use` : ""}`;

  const shown = showAll ? rows : rows.slice(0, PREVIEW);

  return (
    <>
      <CollapsibleTier
        title="Learning"
        summary={summary}
        open={open}
        onOpenChange={onOpenChange}
        actions={
          <>
            <Button variant="ghost" onClick={() => remeasure.mutate()} disabled={remeasure.isPending}>
              {remeasure.isPending ? "Re-measuring…" : "Re-measure now"}
            </Button>
            <Button variant="ghost" onClick={() => setReviewOpen(true)}>
              Review &amp; approve…
            </Button>
          </>
        }
      >
        {remeasure.isSuccess ? (
          <p className="mb-2 text-xs text-mxm-content-secondary" aria-live="polite">
            Re-measured · <span className="text-mxm-green">{remeasure.data.verified_fixed} verified-fixed</span> ·{" "}
            {remeasure.data.verified_reopened} reopened · {remeasure.data.unmeasurable} not yet measurable
          </p>
        ) : remeasure.isError ? (
          <p className="mb-2 text-xs text-mxm-red" aria-live="polite">
            Couldn&apos;t re-measure — try again.
          </p>
        ) : null}

        {cases.isLoading ? (
          <div className="h-24 animate-pulse rounded-mxm border border-mxm-border" />
        ) : cases.isError ? (
          <p className="text-sm text-mxm-red">Couldn&apos;t read learning — try again.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-mxm-content-secondary">Nothing learned yet.</p>
        ) : (
          <ul className="space-y-2">
            {shown.map((c) => {
              const measuredResolved = c.outcome === "resolved" && c.provenanceByField?.outcome === "[V]";
              return (
                <li key={c.kbCaseId}>
                  <Disclosure
                    title={<span className="font-normal">{c.pattern ?? c.areaType}</span>}
                    trailing={
                      <span className="flex items-center gap-2 text-xs font-normal">
                        <span className={measuredResolved ? "text-mxm-green" : "text-mxm-amber"}>
                          {c.outcome === null ? "pending" : c.provenanceByField?.outcome ? c.outcome : "no provenance"}
                        </span>
                        {c.verificationStatus === "verified_fixed" ? (
                          <span className="text-mxm-green">✓ in use</span>
                        ) : c.verificationStatus === "verified_reopened" ? (
                          <span className="text-mxm-amber">reopened</span>
                        ) : (
                          <span className="text-mxm-content-tertiary">{c.reviewed ? "✓ vetted" : "awaiting your OK"}</span>
                        )}
                      </span>
                    }
                  >
                    <div className="text-xs text-mxm-content-secondary">{c.resolution ?? c.notResolvedReason ?? "—"}</div>
                  </Disclosure>
                </li>
              );
            })}
            {rows.length > PREVIEW && (
              <li>
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="rounded-mxm px-1 text-xs text-mxm-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mxm-brand"
                >
                  {showAll ? "Show fewer" : `Show all ${rows.length} →`}
                </button>
              </li>
            )}
          </ul>
        )}
      </CollapsibleTier>
      <AutonomyControls open={reviewOpen} onClose={() => setReviewOpen(false)} />
    </>
  );
}
