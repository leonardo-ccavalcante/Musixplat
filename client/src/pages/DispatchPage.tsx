import { useState } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { LoadingState, ErrorState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { useDevLogin } from "@/features/cockpit/useDevLogin";
import { ARTIFACT_KIND_LABEL } from "@/features/cockpit/artifactKind";
import type { CockpitDispatchDetail } from "@shared/contracts";

// 02:1a — the dispatch screen body (presentational): the released NBA, its reach, and the actual MESSAGE
// that will go out — readable and editable — so the operator sees exactly what they're sending before
// they send. The measured "why" is shown read-only ([V], §14 — the human owns the text, not the number).
// An action screen (DESIGN-STANDARD §1): one filled-coral CTA (Send).
export function DispatchView({
  detail,
  sending,
  onSend,
  onCancel,
}: {
  detail: CockpitDispatchDetail;
  sending: boolean;
  onSend: (body: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState(detail.content.body);
  const kind = ARTIFACT_KIND_LABEL[detail.artifact_kind] ?? detail.artifact_kind;
  const more = detail.reach_count - detail.reach_preview.length;
  const canSend = body.trim().length > 0 && !sending;
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-mxm-content-tertiary">Releasing</p>
        <h1 className="text-2xl font-semibold text-mxm-content">{detail.action_label ?? detail.action_type ?? "—"}</h1>
        <p className="mt-0.5 text-sm text-mxm-content-secondary">cohort {detail.cohort_id}</p>
      </div>

      <section className="rounded-mxm border border-mxm-border bg-mxm-bg-elevated p-[clamp(1rem,2vw,1.4rem)]" aria-label="Reach">
        <p className="text-sm text-mxm-content">
          Reaches <b className="tabnum">{detail.reach_count}</b> restaurant{detail.reach_count === 1 ? "" : "s"} in this cohort
        </p>
        <ul className="mt-2 flex flex-wrap gap-2 text-xs text-mxm-content-tertiary">
          {detail.reach_preview.map((r) => (
            <li key={r.restaurant_id} className="rounded-full border border-mxm-border px-2 py-0.5">
              {r.restaurant_id} · {r.tier_base}
            </li>
          ))}
          {more > 0 && <li className="px-1">and {more} more</li>}
        </ul>
      </section>

      <section className="rounded-mxm border border-mxm-border bg-mxm-bg-elevated p-[clamp(1rem,2vw,1.4rem)]" aria-label="Outgoing message">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <label htmlFor="dispatch-body" className="text-xs uppercase tracking-wide text-mxm-content-tertiary">
            The message · {kind}
          </label>
          <span className="text-xs text-mxm-content-tertiary">Review and edit before sending</span>
        </div>
        {/* The measured why is read-only: a [V] number the operator may quote but never authors (§14). */}
        <p className="mt-2 rounded-mxm border border-mxm-border bg-mxm-bg px-3 py-2 text-xs text-mxm-content-secondary">
          <span className="text-mxm-content-tertiary">Measured (deterministic): </span>
          <span className="text-mxm-content">{detail.content.evidence}</span>
        </p>
        <textarea
          id="dispatch-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={9}
          spellCheck
          className="mt-3 w-full resize-y rounded-mxm border border-mxm-border bg-mxm-bg px-3 py-2 font-mono text-sm leading-relaxed text-mxm-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand"
        />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => onSend(body)} disabled={!canSend} aria-busy={sending}>
          {sending ? "Sending…" : `Send to all ${detail.reach_count} restaurants`}
        </Button>
        <Button variant="ghost" disabled title="Experiment — coming soon">
          Experiment ▸
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// 02:1a — the dispatch page: reads dispatchDetail, sends (writes Release_Batch + Decision_Trace +
// Action_Dispatch atomically) the operator-reviewed body, returns to the cockpit. resulting_level = the
// produced effective_level (override only down; server re-validates). Honest async: loading / error / sending.
export function DispatchPage() {
  const ready = useDevLogin();
  const [, params] = useRoute("/cockpit/dispatch/:nbaId");
  const [, setLocation] = useLocation();
  const nbaId = params?.nbaId ?? "";
  const utils = trpc.useUtils();
  const q = trpc.cockpit.dispatchDetail.useQuery({ nba_id: nbaId }, { enabled: ready && nbaId.length > 0 });
  const send = trpc.cockpit.sendDispatch.useMutation();

  const onSend = (body: string) => {
    const resulting_level = q.data?.effective_level ?? "LOW";
    send.mutate(
      { nba_id: nbaId, resulting_level, body },
      {
        onSuccess: () => {
          void utils.cockpit.list.invalidate();
          void utils.cockpit.weekSummary.invalidate();
          setLocation("/cockpit");
        },
      },
    );
  };

  return (
    <main className="mx-auto max-w-screen-md p-[clamp(1rem,2.5vw,2.25rem)]">
      <Link href="/cockpit" className="text-sm text-mxm-brand hover:underline">
        ← Back to cockpit
      </Link>
      <div className="mt-4">
        {!ready || q.isLoading ? (
          <LoadingState label="Loading dispatch…" />
        ) : q.isError || !q.data ? (
          <ErrorState />
        ) : (
          <DispatchView
            detail={q.data}
            sending={send.isPending}
            onSend={onSend}
            onCancel={() => setLocation("/cockpit")}
          />
        )}
        {send.isError && (
          <p role="alert" className="mt-3 text-sm text-mxm-red">
            {send.error.message}
          </p>
        )}
      </div>
    </main>
  );
}
