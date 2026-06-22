import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { AutonomyControls } from "@/features/cockpit/AutonomyControls";

// Learning = what the AI took from cases. Read-only list with the "why" on expand (cite-don't-assert).
// Vetting state is `reviewed` (there is NO human_authored/verification_status column). "resolved" reads
// green ONLY when its outcome provenance is [V] (§3.10 — no result asserted without provenance).
// Approve/reject reuses the EXISTING AutonomyControls review queue — no new approve code.
export function LearningTier({ ready }: { ready: boolean }) {
  const cases = trpc.observatory.learningCases.useQuery({}, { enabled: ready });
  const [reviewOpen, setReviewOpen] = useState(false);

  return (
    <section className="mt-8" aria-label="What the AI learned">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-mxm-content">Learning</h2>
        <Button variant="ghost" onClick={() => setReviewOpen(true)}>
          Review &amp; approve…
        </Button>
      </div>

      {!ready || cases.isLoading ? (
        <div className="h-24 animate-pulse rounded-mxm border border-mxm-border" />
      ) : cases.isError ? (
        <p className="text-sm text-mxm-red">Couldn&apos;t read learning — try again.</p>
      ) : (cases.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-mxm-content-secondary">Nothing learned yet.</p>
      ) : (
        <ul className="space-y-2">
          {cases.data!.map((c) => {
            const measuredResolved = c.outcome === "resolved" && c.provenanceByField?.outcome === "[V]";
            return (
              <li key={c.kbCaseId} className="rounded-mxm border border-mxm-border p-3">
                <details>
                  <summary className="flex cursor-pointer items-center justify-between gap-3">
                    <span className="text-mxm-content">{c.pattern ?? c.areaType}</span>
                    <span className="flex items-center gap-2 text-xs">
                      <span className={measuredResolved ? "text-mxm-green" : "text-mxm-amber"}>
                        {c.outcome ?? "—"}
                      </span>
                      <span className="text-mxm-content-tertiary">
                        {c.reviewed ? "✓ vetted" : "awaiting your OK"}
                      </span>
                    </span>
                  </summary>
                  <div className="mt-2 text-xs text-mxm-content-secondary">
                    {c.resolution ?? c.notResolvedReason ?? "—"}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      <AutonomyControls open={reviewOpen} onClose={() => setReviewOpen(false)} />
    </section>
  );
}
