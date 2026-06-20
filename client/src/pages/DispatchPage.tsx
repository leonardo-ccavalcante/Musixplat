import { useLocation, useRoute, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { LoadingState, ErrorState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { useDevLogin } from "@/features/cockpit/useDevLogin";
import { ARTIFACT_KIND_LABEL } from "@/features/cockpit/artifactKind";
import type { CockpitDispatchDetail } from "@shared/contracts";

// 02:1a — the dispatch screen body (presentational): the released NBA, its reach, and the rendered artifact
// to review, with ONE primary action (Send). An action screen (DESIGN-STANDARD §1): one filled-coral CTA.
export function DispatchView({
  detail,
  sending,
  onSend,
  onCancel,
}: {
  detail: CockpitDispatchDetail;
  sending: boolean;
  onSend: () => void;
  onCancel: () => void;
}) {
  const kind = ARTIFACT_KIND_LABEL[detail.artifact_kind] ?? detail.artifact_kind;
  const more = detail.reach_count - detail.reach_preview.length;
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-mxm-content-tertiary">Releasing</p>
        <h1 className="text-2xl font-semibold text-mxm-content">{detail.action_label ?? detail.action_type ?? "—"}</h1>
        <p className="mt-0.5 text-sm text-mxm-content-secondary">
          cohort {detail.cohort_id} · {detail.content.path}
        </p>
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

      <section className="rounded-mxm border border-mxm-border bg-mxm-bg-elevated p-[clamp(1rem,2vw,1.4rem)]" aria-label="The artifact">
        <p className="text-xs uppercase tracking-wide text-mxm-content-tertiary">
          The artifact · {kind} <span className="ml-1 normal-case text-mxm-content-tertiary">draft</span>
        </p>
        <dl className="mt-2 space-y-1 text-sm">
          <div>
            <dt className="inline text-mxm-content-secondary">Root: </dt>
            <dd className="inline text-mxm-content">{detail.content.root}</dd>
          </div>
          <div>
            <dt className="inline text-mxm-content-secondary">How: </dt>
            <dd className="inline text-mxm-content">{detail.content.how}</dd>
          </div>
        </dl>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onSend} disabled={sending} aria-busy={sending}>
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
// Action_Dispatch atomically), returns to the cockpit. resulting_level = the produced effective_level
// (override only down; server re-validates). Honest async: loading / error / ready / sending.
export function DispatchPage() {
  const ready = useDevLogin();
  const [, params] = useRoute("/cockpit/dispatch/:nbaId");
  const [, setLocation] = useLocation();
  const nbaId = params?.nbaId ?? "";
  const utils = trpc.useUtils();
  const q = trpc.cockpit.dispatchDetail.useQuery({ nba_id: nbaId }, { enabled: ready && nbaId.length > 0 });
  const send = trpc.cockpit.sendDispatch.useMutation();

  const onSend = () => {
    const resulting_level = q.data?.effective_level ?? "LOW";
    send.mutate(
      { nba_id: nbaId, resulting_level },
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
