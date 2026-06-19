import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { LoadingState, ErrorState } from "@/components/ui/EmptyState";
import { DiagnosisBoard } from "@/features/diagnosis/DiagnosisBoard";
import { DossierModal } from "@/features/diagnosis/DossierModal";
import type { DiagnosisListRow } from "@shared/contracts_05b";

// 05B — Support · Diagnosis. Surfaces the silent problem the ticket hides: the reverse-cascade (someone →
// N affected / M silent → R$) and the 11-field handoff dossier. dev-login mints the POOL-PAY operator
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
  const totalSilent = rows.reduce((s, r) => s + (r.silent_status === "not_evaluable" ? 0 : r.silent), 0);

  return (
    <main className="mx-auto max-w-screen-xl p-[clamp(1rem,2vw,2rem)]">
      <header className="mb-6">
        <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-tight text-mxm-content">
          Support · Diagnosis
        </h1>
        <p className="mt-1.5 max-w-[64ch] text-sm leading-relaxed text-mxm-content-secondary [hyphens:auto] [text-align:justify]">
          The problem the ticket hides: the silent ones and the pattern, found before they become churn.
        </p>
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
