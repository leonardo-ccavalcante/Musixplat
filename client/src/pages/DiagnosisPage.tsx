import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { LoadingState, ErrorState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { DiagnosisBoard } from "@/features/diagnosis/DiagnosisBoard";
import { DossierModal } from "@/features/diagnosis/DossierModal";
import type { DiagnosisListRow } from "@shared/contracts_05b";

// 05B — Support · Diagnosis. Surfaces the silent problem the ticket hides: the reverse-cascade (someone →
// N affected / M silent → €) and the 11-field handoff dossier. dev-login mints the POOL-PAY operator
// (the run-05b scenario pool); tenant_id is resolved server-side. Numbers are produced, never recomputed.
export function DiagnosisPage() {
  const [ready, setReady] = useState(false);
  const [openRow, setOpenRow] = useState<DiagnosisListRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function login(attempt = 0): Promise<void> {
      try {
        const r = await fetch("/auth/dev-login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ user_id: "U-PAY-001" }),
        });
        if (!r.ok) throw new Error(String(r.status));
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled && attempt < 15) setTimeout(() => void login(attempt + 1), 500);
        else if (!cancelled) setReady(true);
      }
    }
    void login();
    return () => {
      cancelled = true;
    };
  }, []);

  const list = trpc.diagnosis.list.useQuery(undefined, { enabled: ready });
  const rows = useMemo(() => (list.data ?? []) as DiagnosisListRow[], [list.data]);
  // Headline = DISTINCT silent restaurants across the pool (server-deduped). Summing per-row silent would
  // double-count, since problems share the same pool population (one ticket reveals the whole pool).
  const summary = trpc.diagnosis.silentSummary.useQuery(undefined, { enabled: ready });
  const totalSilent = summary.data?.distinctSilent ?? 0;

  // "Run flow" — the operator drives the spine IN-PRODUCT (no terminal): reportProblem (intake) ⇒
  // diagnosis.run (orchestrator) ⇒ refetch the board. Numbers are PRODUCED server-side; a failure surfaces
  // fail-closed. Idempotent (re-click never duplicates). Targets the staged POOL-PAY reactive case.
  const utils = trpc.useUtils();
  const report = trpc.diagnosis.reportProblem.useMutation();
  const run = trpc.diagnosis.run.useMutation();
  const [runMsg, setRunMsg] = useState<{ status: "idle" | "running" | "done" | "error"; text?: string }>({
    status: "idle",
  });
  const running = runMsg.status === "running";

  async function runFlow(): Promise<void> {
    setRunMsg({ status: "running" });
    try {
      const rep = await report.mutateAsync({
        restaurantId: "R-PAY-001",
        conversationId: "R-PAY-001:conv1",
        criticality: "critical",
      });
      const out = await run.mutateAsync({ problemId: rep.problem_id });
      await Promise.all([utils.diagnosis.list.invalidate(), utils.diagnosis.silentSummary.invalidate()]);
      setRunMsg({
        status: "done",
        text: `Diagnosed · ${out.affected} affected · ${out.silent} silent · €${out.revenue_lost} · route ${out.route}`,
      });
    } catch (e) {
      setRunMsg({ status: "error", text: e instanceof Error ? e.message : "run failed (fail-closed)" });
    }
  }

  return (
    <main className="mx-auto max-w-screen-xl p-[clamp(1rem,2vw,2rem)]">
      <header className="mb-6">
        <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-tight text-mxm-content">
          Support · Diagnosis
        </h1>
        <p className="mt-1.5 max-w-[64ch] text-sm leading-relaxed text-mxm-content-secondary [hyphens:auto] [text-align:justify]">
          The problem the ticket hides: the silent ones and the pattern, found before they become churn.
        </p>
        {ready && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => void runFlow()}
              disabled={running}
              className="text-mxm-content-inverted"
            >
              {running ? "Running flow…" : "Run flow"}
            </Button>
            <span
              aria-live="polite"
              className={runMsg.status === "error" ? "text-sm text-mxm-red" : "text-sm text-mxm-content-secondary"}
            >
              {runMsg.status === "running" && "Reporting → diagnosing the silent ones…"}
              {runMsg.status === "done" && runMsg.text}
              {runMsg.status === "error" && `Fail-closed: ${runMsg.text}`}
            </span>
          </div>
        )}
        {ready && !list.isLoading && !list.isError && rows.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-1">
            <span className="text-sm text-mxm-content-secondary">
              <span className="text-2xl font-semibold tabular-nums text-mxm-content">{rows.length}</span> diagnosed
            </span>
            <span className="text-sm text-mxm-content-secondary">
              <span className="text-2xl font-semibold tabular-nums text-mxm-brand">{totalSilent}</span> silent ones
              surfaced
            </span>
          </div>
        )}
      </header>

      {!ready || list.isLoading ? (
        <LoadingState label={!ready ? "Signing in…" : "Hunting silent ones…"} />
      ) : list.isError ? (
        <ErrorState />
      ) : (
        <DiagnosisBoard rows={rows} onOpen={setOpenRow} />
      )}

      <DossierModal row={openRow} onClose={() => setOpenRow(null)} />
    </main>
  );
}
