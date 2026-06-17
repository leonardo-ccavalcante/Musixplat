import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { LoadingState, ErrorState } from "@/components/ui/EmptyState";
import { SemaforoCohort, type CohortCell } from "@/features/cohorts/SemaforoCohort";
import { DeltaPanel } from "@/features/cohorts/DeltaPanel";
import { TopVsBase, type Baseline } from "@/features/cohorts/TopVsBase";
import { MoneyPanel, type MoneySummary } from "@/features/cohorts/MoneyPanel";
import { TicketsPanel, type IntentCount } from "@/features/cohorts/TicketsPanel";
import { ChangelogTimeline, type RuleVersion } from "@/features/cohorts/ChangelogTimeline";
import { SandboxPanel } from "@/features/cohorts/SandboxPanel";
import { CohortModal } from "@/features/cohorts/CohortModal";
import type { DeltaRow } from "@shared/contracts";

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
          body: JSON.stringify({ usuario_id: "U-OP-001" }),
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
          Comparación topo-vs-base, deltas priorizados y handoff a NBA.
        </p>
      </header>

      {!ready ? (
        <LoadingState label="Iniciando sesión…" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            {cells.isLoading ? (
              <LoadingState />
            ) : cells.isError ? (
              <ErrorState />
            ) : (
              <SemaforoCohort cells={(cells.data ?? []) as CohortCell[]} onOpen={setSelected} />
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
            <MoneyPanel summary={(money.data ?? { hasSignal: false, value: null, sello: "no-confiable", freshness: null }) as MoneySummary} />
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
