import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { LoadingState, ErrorState } from "@/components/ui/EmptyState";
import { CohortMatrix } from "@/features/cohorts/CohortMatrix";
import { DeltaPanel } from "@/features/cohorts/DeltaPanel";
import { TopVsBase, type Baseline } from "@/features/cohorts/TopVsBase";
import { MoneyPanel, type MoneySummary } from "@/features/cohorts/MoneyPanel";
import { TicketsPanel, type IntentCount } from "@/features/cohorts/TicketsPanel";
import { ChangelogTimeline, type RuleVersion } from "@/features/cohorts/ChangelogTimeline";
import { SandboxPanel } from "@/features/cohorts/SandboxPanel";
import { CohortModal } from "@/features/cohorts/CohortModal";
import type { DeltaRow, CohortCell } from "@shared/contracts";

// Screen 01 — Cohorts Explorer. Composes the slice-01 panels over P01 results (read-only),
// the F-5.2 handoff (in the drill modal), and the EPIC-6 sandbox.
export function CohortsExplorerPage() {
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<CohortCell | null>(null);

  // Dev session (stands in for Manus OAuth locally): mints the server-side tenant cookie.
  // Retries through the dev-server boot race so the session is set before queries fire.
  useEffect(() => {
    let cancelled = false;
    async function login(attempt = 0): Promise<void> {
      try {
        const r = await fetch("/auth/dev-login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ user_id: "U-OP-001" }),
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

  const utils = trpc.useUtils();
  const run = trpc.cohorts.run.useMutation();
  const [runMsg, setRunMsg] = useState<{ status: "idle" | "running" | "done" | "error"; text?: string }>({
    status: "idle",
  });
  const running = runMsg.status === "running";

  // 01 operability — drive the P01 batch from the screen (no `pnpm db:p01`). Numbers are PRODUCED server-side
  // by the producers; the UI only triggers + reads. Fail-closed: a failure surfaces honestly, never green-fake.
  async function runFlow(): Promise<void> {
    setRunMsg({ status: "running" });
    try {
      const r = await run.mutateAsync();
      await Promise.all([
        utils.cohorts.list.invalidate(),
        utils.cohorts.deltas.invalidate(),
        utils.cohorts.intentCounts.invalidate(),
        utils.cohorts.changelog.invalidate(),
        utils.money.summary.invalidate(),
      ]);
      setRunMsg({ status: "done", text: `Computed · ${r.cohorts} cohorts · ${r.memberships} memberships · weeks ${r.weeks.join(", ")}` });
    } catch (e) {
      setRunMsg({ status: "error", text: e instanceof Error ? e.message : "P01 run failed (fail-closed)" });
    }
  }

  const cells = trpc.cohorts.list.useQuery(undefined, { enabled: ready });
  const deltas = trpc.cohorts.deltas.useQuery(undefined, { enabled: ready });
  const money = trpc.money.summary.useQuery(undefined, { enabled: ready });
  const tickets = trpc.cohorts.intentCounts.useQuery(undefined, { enabled: ready });
  const changelog = trpc.cohorts.changelog.useQuery(undefined, { enabled: ready });
  const compare = trpc.cohorts.compare.useQuery(
    { cohort_id: selected?.cohort_id ?? "" },
    { enabled: ready && !!selected },
  );

  return (
    <main className="mx-auto max-w-screen-xl p-[clamp(1rem,2vw,2rem)]">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-mxm-content">Cohorts Explorer</h1>
        <p className="text-sm text-mxm-content-secondary">
          Top-vs-base comparison, prioritized deltas, and handoff to NBA.
        </p>
        {ready && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => void runFlow()} disabled={running} className="text-mxm-content-inverted">
              {running ? "Running P01…" : "Run flow"}
            </Button>
            <span
              aria-live="polite"
              className={runMsg.status === "error" ? "text-sm text-mxm-red" : "text-sm text-mxm-content-secondary"}
            >
              {runMsg.status === "running" && "Computing cohorts → ranking → deltas…"}
              {runMsg.status === "done" && runMsg.text}
              {runMsg.status === "error" && `Fail-closed: ${runMsg.text}`}
            </span>
          </div>
        )}
      </header>

      {!ready ? (
        <LoadingState label="Signing in…" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            {cells.isLoading ? (
              <LoadingState />
            ) : cells.isError ? (
              <ErrorState />
            ) : (
              <CohortMatrix cells={(cells.data ?? []) as CohortCell[]} onOpen={setSelected} />
            )}
          </div>

          {deltas.isLoading ? <LoadingState /> : <DeltaPanel rows={(deltas.data ?? []) as DeltaRow[]} />}

          <TopVsBase
            baseline={(compare.data?.baseline ?? null) as Baseline}
            suppressed={compare.data?.suppressed ?? false}
          />

          {money.isLoading ? (
            <LoadingState />
          ) : (
            <MoneyPanel summary={(money.data ?? { hasSignal: false, value: null, seal: "unreliable", freshness: null }) as MoneySummary} />
          )}

          {tickets.isLoading ? (
            <LoadingState />
          ) : (
            <TicketsPanel counts={(tickets.data ?? []) as IntentCount[]} />
          )}

          {changelog.isLoading ? (
            <LoadingState />
          ) : (
            <ChangelogTimeline versions={(changelog.data ?? []) as RuleVersion[]} />
          )}

          <SandboxPanel />
        </div>
      )}

      <CohortModal cell={selected} onClose={() => setSelected(null)} />
    </main>
  );
}
