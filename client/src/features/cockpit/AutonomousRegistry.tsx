import { Modal } from "@/components/ui/Modal";
import { trpc } from "@/lib/trpc";
import { LoadingState, ErrorState } from "@/components/ui/EmptyState";

// 02:CP2 — the autonomous-actions registry: what the AI did ALONE (origin='auto'). Every row is READ from
// the trace (action · cohort · reach · autonomy level · when) — the AI's accountability trail, never a
// fabricated number (§14). States are explicit (loading / error / honest-empty), never green-fake.
function when(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function AutonomousRegistry({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reg = trpc.cockpit.autoActions.useQuery(undefined, { enabled: open });
  const rows = reg.data ?? [];

  return (
    <Modal open={open} onClose={onClose} title="What the AI handled on its own">
      <p className="mb-3 text-xs text-mxm-content-secondary">
        Actions the AI cleared <b className="text-mxm-content">within the policy your team approved</b> and
        dispatched alone — low-stakes, validated by the deterministic analysis, and never touching money.
        Each one is traced (no human signed it); anything outside the approved range escalates to you (§7).
      </p>
      {reg.isLoading ? (
        <LoadingState label="Loading the registry…" />
      ) : reg.isError ? (
        <ErrorState />
      ) : rows.length === 0 ? (
        <p className="rounded-mxm border border-mxm-border bg-mxm-bg-secondary p-4 text-sm text-mxm-content-secondary">
          The AI hasn&apos;t acted on its own yet. Run the engine, and any low-stakes, non-money action it
          clears will be listed here.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.dispatch_id} className="border-b border-mxm-border pb-3 last:border-b-0 last:pb-0">
              <div className="flex items-baseline gap-2">
                {r.action_type && <span className="tabnum text-xs text-mxm-content-tertiary">{r.action_type}</span>}
                <span className="font-semibold text-mxm-content">{r.title}</span>
                <span className="ml-auto flex items-center gap-1.5 rounded-full border border-mxm-green/40 px-2 py-0.5 text-[0.68rem] text-mxm-green">
                  <span aria-hidden>●</span> acted alone
                </span>
              </div>
              <p className="mt-1 text-xs text-mxm-content-secondary">
                cohort <span className="text-mxm-content">{r.cohort_id}</span> ·{" "}
                <span className="tabnum text-mxm-content">{r.target_count}</span> restaurant
                {r.target_count === 1 ? "" : "s"} reached
                {r.effective_level && <> · {r.effective_level} autonomy</>} · {when(r.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
