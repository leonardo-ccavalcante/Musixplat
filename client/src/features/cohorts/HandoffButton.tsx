import { Button } from "@/components/ui/Button";
import { trpc } from "@/lib/trpc";

// F-5.2 UI — handoff confirm. busy/disabled during the write (anti double-fire), aria-busy,
// success/error states. tenant_id is resolved server-side; never sent from here.
export function HandoffButton({
  restaurante_id,
  cohort_id,
  subgrupo_id,
  semana,
}: {
  restaurante_id: string;
  cohort_id: string;
  subgrupo_id?: string | null;
  semana: string;
}) {
  const m = trpc.handoff.confirm.useMutation();
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="primary"
        disabled={m.isPending || m.isSuccess}
        aria-busy={m.isPending}
        onClick={() => m.mutate({ restaurante_id, cohort_id, subgrupo_id: subgrupo_id ?? null, semana })}
      >
        {m.isPending ? "Enviando…" : m.isSuccess ? "Enviado ✓" : "Handoff a NBA"}
      </Button>
      {m.isError && (
        <span role="alert" className="text-xs text-mxm-red">
          {m.error.message}
        </span>
      )}
    </span>
  );
}
