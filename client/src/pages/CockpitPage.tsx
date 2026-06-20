import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { LoadingState, ErrorState } from "@/components/ui/EmptyState";
import { CockpitBoard, groupRows, type GroupBy } from "@/features/cockpit/CockpitBoard";
import { CockpitHero } from "@/features/cockpit/CockpitHero";
import { CatalogDrawer } from "@/features/cockpit/CatalogDrawer";
import { NbaModal } from "@/features/cockpit/NbaModal";
import { useDevLogin } from "@/features/cockpit/useDevLogin";
import { type RowAction, type RowState } from "@/features/cockpit/CockpitRow";
import type { NbaCockpitRow } from "@shared/contracts";

const GROUP_OPTIONS: { key: GroupBy; label: string }[] = [
  { key: "why", label: "Why I'm needed" },
  { key: "level", label: "Autonomy level" },
  { key: "action", label: "Action type" },
];

// 02:EPIC-1 — Autonomy Cockpit. An AWARENESS screen: the hero is the fleet's autonomy posture (where the AI
// acts alone vs where the human must step in). The queue groups by a chosen axis; the AI acts alone on AUTO
// rows, the human releases/pauses the rest (02:1C), every decision traced. dev-login mints the POOL-001
// operator session; tenant_id is resolved server-side. Numbers are READ from producers, never fabricated (§14).
export function CockpitPage() {
  const ready = useDevLogin();
  const [openNba, setOpenNba] = useState<NbaCockpitRow | null>(null);
  const [actionState, setActionState] = useState<Record<string, RowState | undefined>>({});
  const [groupBy, setGroupBy] = useState<GroupBy>("why");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [catalogOpen, setCatalogOpen] = useState(false);

  const utils = trpc.useUtils();
  const list = trpc.cockpit.list.useQuery(undefined, { enabled: ready });
  const week = trpc.cockpit.weekSummary.useQuery(undefined, { enabled: ready });
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
            [row.nba_id]: { status: "done", msg: `${action === "RELEASE" ? "Released" : "Paused"} ✓ trace ${res.traceId.slice(0, 8)}` },
          }));
          void utils.cockpit.list.invalidate();
          void utils.cockpit.weekSummary.invalidate(); // the trace just changed — refresh "your week"
        },
        onError: (e) => setActionState((s) => ({ ...s, [row.nba_id]: { status: "error", msg: e.message } })),
      },
    );
  };

  const rows = useMemo(() => (list.data ?? []) as NbaCockpitRow[], [list.data]);
  const groups = useMemo(() => groupRows(rows, groupBy), [rows, groupBy]);
  const counts = useMemo(
    () => ({
      total: rows.length,
      cohorts: new Set(rows.map((r) => r.cohort_id)).size,
      autos: rows.filter((r) => r.status === "auto").length,
      money: rows.filter((r) => r.reason === "money").length,
      level: rows.filter((r) => r.reason === "level").length,
      gate: rows.filter((r) => r.reason === "gates").length,
    }),
    [rows],
  );

  const setAll = (open: boolean) => setOpenGroups(Object.fromEntries(groups.map((g) => [g.key, open])));
  const toggle = (key: string) =>
    setOpenGroups((s) => ({ ...s, [key]: !(s[key] ?? groups.find((g) => g.key === key)?.defaultOpen ?? false) }));
  const pickGroup = (key: GroupBy) => {
    setGroupBy(key);
    setOpenGroups({}); // reset to per-group defaults for the new axis
  };

  return (
    <main className="mx-auto max-w-screen-xl p-[clamp(1rem,2.5vw,2.25rem)]">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-mxm-content">Autonomy Cockpit</h1>
        <p className="mt-1 max-w-[70ch] text-sm text-mxm-content-secondary">
          Where is my AI fleet acting on its own — and exactly where do I need to step in?
        </p>
      </header>

      {!ready || list.isLoading ? (
        <LoadingState label={!ready ? "Signing in…" : "Loading proposals…"} />
      ) : list.isError ? (
        <ErrorState />
      ) : (
        <>
          <CockpitHero counts={counts} week={week.data} onOpenCatalog={() => setCatalogOpen(true)} />

          <div className="mb-3 mt-[clamp(1.5rem,3vw,2.25rem)] flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <h2 id="queue-h" className="text-lg font-semibold text-mxm-content">The queue</h2>
              <span className="flex items-center gap-2 text-xs text-mxm-content-secondary">
                <button onClick={() => setAll(true)} className="hover:text-mxm-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand">Expand all</button>
                <span aria-hidden className="text-mxm-border">·</span>
                <button onClick={() => setAll(false)} className="hover:text-mxm-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand">Collapse all</button>
              </span>
            </div>
            <div role="group" aria-labelledby="queue-h" aria-label="Group the queue by" className="inline-flex items-center rounded-full border border-mxm-border bg-mxm-bg-elevated p-0.5">
              <span className="px-2 text-xs text-mxm-content-tertiary">Group by</span>
              {GROUP_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  aria-pressed={groupBy === o.key}
                  onClick={() => pickGroup(o.key)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand",
                    groupBy === o.key ? "bg-mxm-bg-secondary text-mxm-content" : "text-mxm-content-secondary hover:text-mxm-content",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <CockpitBoard groups={groups} openGroups={openGroups} onToggle={toggle} onAction={onAction} onOpen={setOpenNba} actionState={actionState} />
        </>
      )}

      <NbaModal row={openNba} onClose={() => setOpenNba(null)} onAction={onAction} state={openNba ? actionState[openNba.nba_id] : undefined} />
      <CatalogDrawer open={catalogOpen} onClose={() => setCatalogOpen(false)} />
    </main>
  );
}
