import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { LoadingState, ErrorState } from "@/components/ui/EmptyState";
import { CockpitBoard } from "@/features/cockpit/CockpitBoard";
import { type RowAction, type RowState } from "@/features/cockpit/CockpitRow";
import type { NbaCockpitRow } from "@shared/contracts";

// 02:EPIC-1 — Autonomy Cockpit. Lists AI-proposed NBAs with their autonomy verdict: the AI acts alone on
// AUTO rows; the human releases/pauses the rest (02:1C), and every decision is traced. dev-login mints the
// POOL-001 operator session (stands in for Manus OAuth locally); tenant_id is resolved server-side.
export function CockpitPage() {
  const [ready, setReady] = useState(false);
  const [actionState, setActionState] = useState<Record<string, RowState | undefined>>({});

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
  const list = trpc.cockpit.list.useQuery(undefined, { enabled: ready });
  const release = trpc.cockpit.release.useMutation();

  const onAction = (row: NbaCockpitRow, action: RowAction) => {
    // override only DOWN: release at the granted level, pause clamps to LOW (server re-validates, BR-1).
    const resulting_level = action === "PAUSE" ? "LOW" : row.effective_level ?? "LOW";
    setActionState((s) => ({ ...s, [row.nba_id]: { status: "pending" } }));
    release.mutate(
      { nba_id: row.nba_id, action, resulting_level },
      {
        onSuccess: (res) => {
          setActionState((s) => ({
            ...s,
            [row.nba_id]: {
              status: "done",
              msg: `${action === "RELEASE" ? "Released" : "Paused"} ✓ trace ${res.traceId.slice(0, 8)}`,
            },
          }));
          void utils.cockpit.list.invalidate();
        },
        onError: (e) => setActionState((s) => ({ ...s, [row.nba_id]: { status: "error", msg: e.message } })),
      },
    );
  };

  const rows = useMemo(() => (list.data ?? []) as NbaCockpitRow[], [list.data]);
  const autos = rows.filter((r) => r.status === "auto").length;

  return (
    <main className="mx-auto max-w-screen-xl p-[clamp(1rem,2vw,2rem)]">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-mxm-content">Autonomy Cockpit</h1>
        <p className="mt-1 max-w-[70ch] text-sm text-mxm-content-secondary">
          AI-proposed best actions with their autonomy verdict. The AI acts alone on the low-stakes ones; you
          decide the rest — every action is traced.
        </p>
        {ready && !list.isLoading && !list.isError && (
          <div className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-1">
            <span className="text-sm text-mxm-content-secondary">
              <span className="text-2xl font-semibold tabular-nums text-mxm-brand">{rows.length - autos}</span> need
              your decision
            </span>
            <span className="text-sm text-mxm-content-secondary">
              <span className="text-2xl font-semibold tabular-nums text-mxm-green">{autos}</span> auto-handled by
              the AI
            </span>
          </div>
        )}
      </header>

      {!ready || list.isLoading ? (
        <LoadingState label={!ready ? "Signing in…" : "Loading proposals…"} />
      ) : list.isError ? (
        <ErrorState />
      ) : (
        <CockpitBoard rows={rows} onAction={onAction} actionState={actionState} />
      )}
    </main>
  );
}
