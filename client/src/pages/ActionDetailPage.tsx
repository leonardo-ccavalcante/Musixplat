import { Link, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/EmptyState";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import { useDevLogin } from "@/features/cockpit/useDevLogin";

// 02:DETAIL-D — NBA action detail (a screen-within-the-cockpit): two separate views — Definition
// ("what it is") and Operation ("does it work?"). The hit rate is the deterministic DIAGNOSTIC rate;
// it shows three states (solid / thin-data / no-data), never a single fake %. Numbers are read, never
// recomputed (§14); acerto_rate NULL ⇒ "not enough confirmed runs", never 0%.
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-mxm-content-tertiary">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums text-mxm-content">{value}</p>
    </div>
  );
}

export function ActionDetailPage() {
  const ready = useDevLogin();
  const [, params] = useRoute("/cockpit/action/:code");
  const code = params?.code ?? "";
  const q = trpc.nba.detail.useQuery({ action_code: code }, { enabled: ready && code.length > 0 });

  return (
    <main className="mx-auto max-w-screen-md p-[clamp(1rem,2vw,2rem)]">
      <Link href="/cockpit" className="text-sm text-mxm-brand hover:underline">← Back to cockpit</Link>

      {!ready || q.isLoading ? (
        <LoadingState label="Loading action…" />
      ) : q.isError ? (
        <ErrorState label="Action not found" />
      ) : !q.data ? (
        <EmptyState>No data.</EmptyState>
      ) : (
        <>
          <header className="mb-6 mt-2">
            <h1 className="text-2xl font-semibold text-mxm-content">
              {q.data.definition.code} · {q.data.definition.label}
            </h1>
            <p className="mt-1 text-sm text-mxm-content-secondary">
              {q.data.definition.funnel_stage} · {q.data.definition.financial_class === "direct"
                ? "⚠ touches money (human releases)"
                : "does not touch money"}
            </p>
          </header>

          {/* VIEW 1 — Definition */}
          <section aria-labelledby="def-h" className="mb-8 space-y-3">
            <h2 id="def-h" className="text-xs font-semibold uppercase tracking-wide text-mxm-content-tertiary">
              Definition — what it is
            </h2>
            <div className="rounded-mxm border border-mxm-border p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-mxm-content-tertiary">What it fires</p>
              <p className="mt-0.5 text-mxm-content">{q.data.definition.action_hint}</p>
            </div>
            <div className="rounded-mxm border border-mxm-border p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-mxm-content-tertiary">How it works — the path</p>
              <p className="mt-0.5 whitespace-pre-line text-mxm-content-secondary">
                {q.data.definition.playbook ?? "—"}
              </p>
            </div>
            <div className="rounded-mxm border border-mxm-border p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-mxm-content-tertiary">Signal it reads · approved range</p>
              <p className="mt-0.5 text-mxm-content-secondary">
                {q.data.definition.root_cause_signal ?? "—"} · knob {q.data.definition.threshold_knob ?? "—"}
              </p>
            </div>
            <p className="text-xs text-mxm-content-tertiary">
              Born {q.data.definition.created_at?.slice(0, 10) ?? "—"} · current version {q.data.definition.current_version ?? "—"}
            </p>
          </section>

          {/* VIEW 2 — Operation */}
          <section aria-labelledby="op-h" aria-live="polite" className="space-y-3">
            <h2 id="op-h" className="text-xs font-semibold uppercase tracking-wide text-mxm-content-tertiary">
              Operation — does it work? <ProvenanceBadge prov="[V]" className="ml-1" /> measured
            </h2>
            {q.data.history.run_count === 0 ? (
              <EmptyState>This action has not run yet.</EmptyState>
            ) : (
              <>
                <div className="flex flex-wrap gap-x-10 gap-y-3 rounded-mxm border border-mxm-border p-4">
                  <Stat label="Times run (company-wide)" value={String(q.data.history.run_count)} />
                  <Stat
                    label="Hit rate (diagnosis)"
                    value={q.data.history.acerto_rate == null ? "not enough confirmed runs" : `${Math.round(q.data.history.acerto_rate * 100)}%`}
                  />
                  <Stat label="Last run" value={q.data.history.last_run_at?.slice(0, 10) ?? "—"} />
                </div>
                <ul className="space-y-1 text-sm">
                  <li className="text-mxm-content">✓ solid (breach + enough, non-suppressed data): <span className="tabular-nums">{q.data.history.solid_count}</span></li>
                  <li className="text-mxm-content-secondary">~ unconfirmed (breach on thin/suppressed data): <span className="tabular-nums">{q.data.history.unconfirmed_count}</span></li>
                  <li className="text-mxm-content-tertiary">· no attributable cause: <span className="tabular-nums">{q.data.history.no_data_count}</span></li>
                </ul>
                <div className="rounded-mxm border border-mxm-border p-3 text-sm text-mxm-content-tertiary">
                  Recurrence ("eco" — resolved then re-opened): not measured yet.
                </div>
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}
