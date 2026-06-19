import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ProvenanceLegend } from "@/components/ui/ProvenanceLegend";
import { fmtNum } from "@/lib/utils";
import type { ArtifactRow } from "@shared/contracts_05c";
import type { ArtifactAction } from "./ArtifactQueue";

// 05C — open the PERSISTED artifact so the human SEES what they are deciding on (Leo: "onde está o
// artefato?"): the email it would send, WHO is impacted (the real list, silent ones marked), the produced
// € impact, the KB-grounded HOW, and the route. Every field is READ from content (produced), never faked.
// The human gate (approve/reject/escalate) lives here, in view — no decision without seeing the artifact.
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, dash = "n/a"): string => (v == null || v === "" ? dash : String(v));
const money = (v: unknown): string => (typeof v === "number" ? fmtNum(v) : "n/a");

type Affected = { restaurant_id?: unknown; complained?: unknown; silent?: unknown };

export function ArtifactModal({
  artifact,
  onClose,
  onDecide,
  busyId,
}: {
  artifact: ArtifactRow | null;
  onClose: () => void;
  onDecide: (id: string, action: ArtifactAction) => void;
  busyId: string | null;
}) {
  const c = isObj(artifact?.content) ? (artifact!.content as Record<string, unknown>) : {};
  const body = isObj(c.body) ? c.body : {};
  const who = (Array.isArray(body.who_affected) ? body.who_affected : []) as Affected[];
  const silent = who.filter((a) => isObj(a) && a.silent).length;
  const impact = isObj(body.impact) ? body.impact : {};
  const root = isObj(body.root) ? body.root : {};
  const pending = artifact?.status === "pending_review";
  const busy = !!artifact && busyId === artifact.artifact_id;
  const id = artifact?.artifact_id ?? "";

  const ACTIONS: ArtifactAction[] = ["approve", "reject", "escalate"];

  return (
    <Modal open={!!artifact} onClose={onClose} title="Artifact · review">
      {artifact && (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs text-mxm-content-secondary">
            <span className="rounded bg-mxm-bg-secondary px-1.5 py-0.5 text-mxm-content">{artifact.artifact_type}</span>
            <span>→ accountable to <span className="text-mxm-content">{artifact.target_metric}</span></span>
            <span className="rounded bg-mxm-bg-secondary px-1.5 py-0.5">{artifact.status}</span>
          </div>

          <div className="rounded-mxm border border-mxm-border p-3">
            <p className="text-xs uppercase tracking-wide text-mxm-content-tertiary">Subject</p>
            <p className="mt-0.5 font-medium text-mxm-content">{str(c.subject)}</p>
          </div>

          <section aria-label="Who is affected" className="rounded-mxm border border-mxm-border p-3">
            <p className="text-xs uppercase tracking-wide text-mxm-content-tertiary">
              Who is affected · {who.length} restaurant(s) · <span className="text-mxm-brand">{silent} silent</span>
            </p>
            {who.length === 0 ? (
              <p className="mt-1 text-mxm-content-secondary">No population resolved (fail-closed).</p>
            ) : (
              <ul className="mt-1.5 max-h-44 space-y-0.5 overflow-y-auto">
                {who.map((a, i) => (
                  <li key={str(a.restaurant_id, `r${i}`)} className="flex justify-between gap-3 text-xs">
                    <span className="text-mxm-content">{str(a.restaurant_id)}</span>
                    <span className={a.silent ? "text-mxm-brand" : "text-mxm-content-secondary"}>
                      {a.silent ? "silent · never spoke" : "spoke up"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-mxm-content-secondary">Impact</dt>
            <dd className="text-mxm-content">€ {money(impact.revenue_lost)} at risk <span className="text-mxm-content-tertiary">[I]</span></dd>
            <dt className="text-mxm-content-secondary">Root</dt>
            <dd className="text-mxm-content">{str(root.hypothesis_root)}</dd>
            <dt className="text-mxm-content-secondary">How (KB)</dt>
            <dd className="text-mxm-content">{str(body.how)}</dd>
            <dt className="text-mxm-content-secondary">Route</dt>
            <dd className="text-mxm-content">{str(body.route)}</dd>
          </dl>

          {pending ? (
            <div className="flex flex-wrap gap-2 border-t border-mxm-border pt-3">
              <Button type="button" className="text-mxm-content-inverted" disabled={busy} onClick={() => onDecide(id, "approve")}>
                Approve
              </Button>
              {ACTIONS.slice(1).map((a) => (
                <Button key={a} type="button" variant="ghost" disabled={busy} onClick={() => onDecide(id, a)}>
                  {a[0]!.toUpperCase() + a.slice(1)}
                </Button>
              ))}
            </div>
          ) : (
            <p className="border-t border-mxm-border pt-3 text-xs text-mxm-content-secondary">
              {artifact.status} · 4-eyes trace {artifact.decision_trace_id?.slice(0, 8) ?? "—"}
            </p>
          )}

          <ProvenanceLegend className="border-t border-mxm-border pt-3" />
        </div>
      )}
    </Modal>
  );
}
