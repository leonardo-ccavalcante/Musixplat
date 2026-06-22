import { Link } from "wouter";
import { Button } from "@/components/ui/Button";
import { trpc } from "@/lib/trpc";

export type HandoffStatus = "idle" | "pending" | "success" | "error";

// F-5.2 UI (presentational) — the Send button + the VISIBLE record. On success we surface the evento_id (the
// Prioritized_NBA_Event the server wrote, append-only) — previously discarded — and link to the handed-off
// cohort FOCUSED in the cockpit (?focus=), not the bare board. Split from the trpc wiring so it's testable.
export function HandoffActions({
  cohortId,
  status,
  eventoId,
  errorMsg,
  onSend,
}: {
  cohortId: string;
  status: HandoffStatus;
  eventoId?: string | null;
  errorMsg?: string;
  onSend: () => void;
}) {
  const label = status === "pending" ? "Sending…" : status === "success" ? "Sent ✓" : "Send to NBA";
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        variant="primary"
        disabled={status === "pending" || status === "success"}
        aria-busy={status === "pending"}
        onClick={onSend}
      >
        {label}
      </Button>
      {status === "success" && (
        <>
          {eventoId && (
            // the registro is now visible + auditable (was discarded before): short id shown, full id in the title.
            <span className="text-xs text-mxm-content-tertiary" title={`Prioritized_NBA_Event ${eventoId}`}>
              registered · evento #{eventoId.slice(0, 8)}
            </span>
          )}
          <Link
            href={`/cockpit?focus=${encodeURIComponent(cohortId)}`}
            className="text-xs text-mxm-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand"
          >
            View cohort in Cockpit →
          </Link>
        </>
      )}
      {status === "error" && (
        <span role="alert" className="text-xs text-mxm-red">
          {errorMsg}
        </span>
      )}
    </span>
  );
}

// F-5.2 UI — handoff confirm wiring. busy/disabled during the write (anti double-fire); tenant_id is resolved
// server-side, never sent from here. Maps the mutation lifecycle to HandoffActions and threads the returned
// evento_id through so the operator sees the record.
export function HandoffButton({
  restaurant_id,
  cohort_id,
  subgroup_id,
  week,
}: {
  restaurant_id: string;
  cohort_id: string;
  subgroup_id?: string | null;
  week: string;
}) {
  const m = trpc.handoff.confirm.useMutation();
  const status: HandoffStatus = m.isPending ? "pending" : m.isSuccess ? "success" : m.isError ? "error" : "idle";
  return (
    <HandoffActions
      cohortId={cohort_id}
      status={status}
      eventoId={m.data?.evento_id}
      errorMsg={m.error?.message}
      onSend={() => m.mutate({ restaurant_id, cohort_id, subgroup_id: subgroup_id ?? null, week })}
    />
  );
}
