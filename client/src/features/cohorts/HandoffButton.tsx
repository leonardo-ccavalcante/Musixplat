import { Button } from "@/components/ui/Button";
import { trpc } from "@/lib/trpc";

// F-5.2 UI — handoff confirm. busy/disabled during the write (anti double-fire), aria-busy,
// success/error states. tenant_id is resolved server-side; never sent from here.
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
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="primary"
        disabled={m.isPending || m.isSuccess}
        aria-busy={m.isPending}
        onClick={() => m.mutate({ restaurant_id, cohort_id, subgroup_id: subgroup_id ?? null, week })}
      >
        {m.isPending ? "Sending…" : m.isSuccess ? "Sent ✓" : "Handoff to NBA"}
      </Button>
      {m.isError && (
        <span role="alert" className="text-xs text-mxm-red">
          {m.error.message}
        </span>
      )}
    </span>
  );
}
