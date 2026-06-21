import { Modal } from "@/components/ui/Modal";
import { trpc } from "@/lib/trpc";
import { LoadingState, ErrorState } from "@/components/ui/EmptyState";

// 02C:6a — "Escalated to you": the cases the MOTOR (the ≤3 hypothesis LLM loop) handed back to a human
// because it found no in-range fix. Every row is READ from Knowledge_Case (area · pattern · why it stopped ·
// the hypotheses it tried + discarded · the LLM cost of the attempt) — the AI's accountability trail when it
// stepped back, never a fabricated number (§14). cost_usd is honest: NULL ⇒ "unpriced", never "$0" (§3.7).
// Acted-vs-escalated carries redundant text+icon, not color alone (WCAG 2.1 AA).
function when(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// USD or honest "unpriced" — never "$0" when the cost is unknown (the stub drove it / no priced LLM rows).
function cost(usd: number | null): { text: string; unpriced: boolean } {
  if (usd == null) return { text: "unpriced", unpriced: true };
  return { text: `$${usd.toFixed(usd < 0.01 ? 4 : 2)}`, unpriced: false };
}

// discarded_branches is jsonb (unknown over the wire): a list of {hypothesis, reason} the loop tried and
// dropped. Render defensively — any shape that isn't a usable array of objects degrades to nothing shown.
interface Branch {
  hypothesis: string;
  reason: string;
}
function branches(raw: unknown): Branch[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((b): Branch[] => {
    if (b == null || typeof b !== "object") return [];
    const o = b as Record<string, unknown>;
    const hypothesis = typeof o.hypothesis === "string" ? o.hypothesis : typeof o.branch === "string" ? o.branch : "";
    const reason = typeof o.reason === "string" ? o.reason : typeof o.why === "string" ? o.why : "";
    return hypothesis || reason ? [{ hypothesis, reason }] : [];
  });
}

export function EscalatedList({ open, onClose }: { open: boolean; onClose: () => void }) {
  const esc = trpc.motor.escalations.useQuery(undefined, { enabled: open });
  const rows = esc.data ?? [];

  return (
    <Modal open={open} onClose={onClose} title="Escalated to you">
      <p className="mb-3 text-xs text-mxm-content-secondary">
        Cases the motor handed back to you because it <b className="text-mxm-content">found no in-range fix</b> —
        it tried its hypotheses, discarded the ones that didn&apos;t hold, and stepped back rather than act
        outside the range you approved (§7). The token cost of each attempt is shown honestly.
      </p>
      {esc.isLoading ? (
        <LoadingState label="Loading escalations…" />
      ) : esc.isError ? (
        <ErrorState />
      ) : rows.length === 0 ? (
        <p className="rounded-mxm border border-mxm-border bg-mxm-bg-secondary p-4 text-sm text-mxm-content-secondary">
          No escalations — the AI acted within range or found no in-range gap.
        </p>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => {
            const c = cost(r.cost_usd);
            const tried = branches(r.discarded_branches);
            return (
              <li key={r.kb_case_id} className="border-b border-mxm-border pb-4 last:border-b-0 last:pb-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="tabnum text-xs text-mxm-content-tertiary">{r.area_type}</span>
                  <span className="font-semibold text-mxm-content">{r.pattern || "—"}</span>
                  <span className="ml-auto flex items-center gap-1.5 rounded-full border border-mxm-amber/40 px-2 py-0.5 text-[0.68rem] text-mxm-amber">
                    <span aria-hidden>▲</span> escalated to you
                  </span>
                </div>
                {r.not_resolved_reason && (
                  <p className="mt-1.5 text-xs text-mxm-content-secondary">
                    <span className="text-mxm-content-tertiary">Why it stopped: </span>
                    {r.not_resolved_reason}
                  </p>
                )}
                {tried.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[0.7rem] uppercase tracking-wide text-mxm-content-tertiary">
                      Hypotheses it tried &amp; discarded
                    </p>
                    <ul className="mt-1 space-y-1">
                      {tried.map((b, i) => (
                        <li key={i} className="text-xs text-mxm-content-secondary">
                          <span aria-hidden className="mr-1 text-mxm-content-tertiary">✕</span>
                          {b.hypothesis && <span className="text-mxm-content">{b.hypothesis}</span>}
                          {b.hypothesis && b.reason && <span className="text-mxm-content-tertiary"> — </span>}
                          {b.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="mt-2 flex items-center gap-1.5 text-xs text-mxm-content-secondary">
                  <span className="text-mxm-content-tertiary">Token cost:</span>
                  <span className={c.unpriced ? "text-mxm-content-tertiary" : "tabnum text-mxm-content"}>{c.text}</span>
                  <span aria-hidden className="text-mxm-border">·</span>
                  <span className="text-mxm-content-tertiary">{when(r.created_at)}</span>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
