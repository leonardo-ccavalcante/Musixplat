import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { AutonomyControls } from "@/features/cockpit/AutonomyControls";
import { TierHeader } from "./TierHeader";
import { type ExpandCmd, useExpandGroup } from "./useExpandGroup";

// Learning = what the AI took from cases. Read-only list with the "why" on expand (cite-don't-assert).
// Vetting state is `reviewed` (there is NO human_authored/verification_status column). "resolved" reads
// green ONLY when its outcome provenance is [V] (§3.10 — no result asserted without provenance).
// Approve/reject reuses the EXISTING AutonomyControls review queue — no new approve code.
export function LearningTier({ ready, cmd }: { ready: boolean; cmd: ExpandCmd | null }) {
  const cases = trpc.observatory.learningCases.useQuery({}, { enabled: ready });
  const [reviewOpen, setReviewOpen] = useState(false);
  const rows = cases.data ?? [];
  const keys = useMemo(() => (cases.data ?? []).map((c) => c.kbCaseId), [cases.data]);
  const { isOpen, setOpen } = useExpandGroup(cmd, keys);

  return (
    <section className="mt-8" aria-label="What the AI learned">
      <TierHeader title="Learning" count={cases.isSuccess ? rows.length : undefined}>
        <Button variant="ghost" onClick={() => setReviewOpen(true)}>
          Review &amp; approve…
        </Button>
      </TierHeader>

      {!ready || cases.isLoading ? (
        <div className="h-24 animate-pulse rounded-mxm border border-mxm-border" />
      ) : cases.isError ? (
        <p className="text-sm text-mxm-red">Couldn&apos;t read learning — try again.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-mxm-content-secondary">Nothing learned yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => {
            const measuredResolved = c.outcome === "resolved" && c.provenanceByField?.outcome === "[V]";
            return (
              <li key={c.kbCaseId}>
                <Disclosure
                  open={isOpen(c.kbCaseId)}
                  onOpenChange={(o) => setOpen(c.kbCaseId, o)}
                  title={<span className="font-normal">{c.pattern ?? c.areaType}</span>}
                  trailing={
                    <span className="flex items-center gap-2 text-xs font-normal">
                      <span className={measuredResolved ? "text-mxm-green" : "text-mxm-amber"}>
                        {c.outcome === null ? "pending" : c.provenanceByField?.outcome ? c.outcome : "no provenance"}
                      </span>
                      <span className="text-mxm-content-tertiary">{c.reviewed ? "✓ vetted" : "awaiting your OK"}</span>
                    </span>
                  }
                >
                  <div className="text-xs text-mxm-content-secondary">{c.resolution ?? c.notResolvedReason ?? "—"}</div>
                </Disclosure>
              </li>
            );
          })}
        </ul>
      )}

      <AutonomyControls open={reviewOpen} onClose={() => setReviewOpen(false)} />
    </section>
  );
}
