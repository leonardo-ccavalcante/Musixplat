import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { LoadingState, ErrorState } from "@/components/ui/EmptyState";
import { CockpitBoard, groupRows, type GroupBy } from "@/features/cockpit/CockpitBoard";
import { CockpitHero, type RunResult, type MotorRunResult } from "@/features/cockpit/CockpitHero";
import { CatalogDrawer } from "@/features/cockpit/CatalogDrawer";
import { AutonomousRegistry } from "@/features/cockpit/AutonomousRegistry";
import { EscalatedList } from "@/features/cockpit/EscalatedList";
import { AutonomyControls } from "@/features/cockpit/AutonomyControls";
import { Button } from "@/components/ui/Button";
import { NbaModal, type KbImpact } from "@/features/cockpit/NbaModal";
import { useDevLogin } from "@/features/cockpit/useDevLogin";
import { type RowAction, type RowState, type KbReview } from "@/features/cockpit/CockpitRow";
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
  const [registryOpen, setRegistryOpen] = useState(false);
  const [escalationsOpen, setEscalationsOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [motorResult, setMotorResult] = useState<MotorRunResult | null>(null);

  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const list = trpc.cockpit.list.useQuery(undefined, { enabled: ready });
  const week = trpc.cockpit.weekSummary.useQuery(undefined, { enabled: ready });
  const release = trpc.cockpit.release.useMutation();
  const propose = trpc.cockpit.proposePool.useMutation();
  const runMotor = trpc.motor.runPool.useMutation();

  // 02:CP2 — "Run NBA": fire the engine across the pool; on success refresh the board + "your week" + the
  // registry (the autonomous actions it just took), and surface the spectrum inline.
  const onRunNba = () => {
    propose.mutate(undefined, {
      onSuccess: (res) => {
        setRunResult(res);
        void utils.cockpit.list.invalidate();
        void utils.cockpit.weekSummary.invalidate();
        void utils.cockpit.autoActions.invalidate();
      },
    });
  };

  // 02C:6a — "Run Motor": fire the LLM autonomous engine pool-wide (mirrors Run NBA's pool decision — the
  // board spans cohorts, so there's no single focused cohort to target). The OpenAI call is slow; the hero
  // shows an explicit busy state, never a fake-instant success. On success refresh the escalations feed + the
  // auto-actions registry + "your week" (the motor may have acted alone and left traces).
  const onRunMotor = () => {
    runMotor.mutate(undefined, {
      onSuccess: (res) => {
        setMotorResult(res);
        void utils.motor.escalations.invalidate();
        void utils.cockpit.autoActions.invalidate();
        void utils.cockpit.weekSummary.invalidate();
      },
    });
  };

  const onAction = (row: NbaCockpitRow, action: RowAction) => {
    // RELEASE opens the dispatch screen (review reach + artifact, then Send writes the trace there, 02:1a).
    if (action === "RELEASE") {
      setLocation(`/cockpit/dispatch/${row.nba_id}`);
      return;
    }
    // PAUSE stays inline: clamp to LOW (override only down; server re-validates, BR-1).
    const resulting_level = "LOW";
    setActionState((s) => ({ ...s, [row.nba_id]: { status: "pending" } }));
    release.mutate(
      { nba_id: row.nba_id, action, resulting_level },
      {
        onSuccess: (res) => {
          setActionState((s) => ({
            ...s,
            [row.nba_id]: { status: "done", msg: `Paused ✓ trace ${res.traceId.slice(0, 8)}` },
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

  // P06 NBA tie-in — per-row KB impact (TEXT signal only, §3.3): does the base hold a Policy/Terms doc
  // relevant to this NBA? Batched over httpBatchLink into one request. Fail-closed: pending/error rows
  // are simply omitted from the map, so the badge never shows a false signal.
  const impactQueries = trpc.useQueries((t) =>
    rows.map((r) => t.knowledge.nbaImpact({ nbaId: r.nba_id }, { enabled: ready, retry: false, staleTime: 60_000 })),
  );
  const kbReviews = useMemo(() => {
    const m: Record<string, KbReview> = {};
    rows.forEach((r, i) => {
      const d = impactQueries[i]?.data;
      if (d) m[r.nba_id] = { shouldReview: d.shouldReview, note: d.note };
    });
    return m;
  }, [rows, impactQueries]);

  const openImpact: KbImpact | undefined = useMemo(() => {
    if (!openNba) return undefined;
    const i = rows.findIndex((r) => r.nba_id === openNba.nba_id);
    const d = i >= 0 ? impactQueries[i]?.data : undefined;
    return d ? { shouldReview: d.shouldReview, evidence: d.evidence, note: d.note } : undefined;
  }, [openNba, rows, impactQueries]);

  return (
    <main className="mx-auto max-w-screen-xl p-[clamp(1rem,2.5vw,2.25rem)]">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-mxm-content">Autonomy Cockpit</h1>
          <p className="mt-1 max-w-[70ch] text-sm text-mxm-content-secondary">
            Where is my AI fleet acting on its own — and exactly where do I need to step in?
          </p>
        </div>
        {/* 02C:6b — the human-editable boundary the motor acts within (range · knobs · learnings to approve). */}
        <Button variant="ghost" onClick={() => setControlsOpen(true)} aria-haspopup="dialog">
          Autonomy Controls
        </Button>
      </header>

      {!ready || list.isLoading ? (
        <LoadingState label={!ready ? "Signing in…" : "Loading proposals…"} />
      ) : list.isError ? (
        <ErrorState />
      ) : (
        <>
          <CockpitHero
            counts={counts}
            week={week.data}
            onOpenCatalog={() => setCatalogOpen(true)}
            onOpenRegistry={() => setRegistryOpen(true)}
            onRunNba={onRunNba}
            running={propose.isPending}
            runResult={runResult}
            onRunMotor={onRunMotor}
            motorRunning={runMotor.isPending}
            motorResult={motorResult}
            onOpenEscalations={() => setEscalationsOpen(true)}
          />

          <div className="mb-3 mt-[clamp(1.5rem,3vw,2.25rem)] flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <h2 id="queue-h" className="text-lg font-semibold text-mxm-content">The queue</h2>
              <span className="flex items-center gap-1 text-xs text-mxm-content-secondary">
                <button onClick={() => setAll(true)} className="inline-flex min-h-[24px] items-center rounded px-1 hover:text-mxm-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand">Expand all</button>
                <span aria-hidden className="text-mxm-border">·</span>
                <button onClick={() => setAll(false)} className="inline-flex min-h-[24px] items-center rounded px-1 hover:text-mxm-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand">Collapse all</button>
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

          <CockpitBoard groups={groups} openGroups={openGroups} onToggle={toggle} onAction={onAction} onOpen={setOpenNba} actionState={actionState} kbReviews={kbReviews} />
        </>
      )}

      <NbaModal
        row={openNba}
        onClose={() => setOpenNba(null)}
        onAction={onAction}
        state={openNba ? actionState[openNba.nba_id] : undefined}
        kbImpact={openImpact}
      />
      <CatalogDrawer open={catalogOpen} onClose={() => setCatalogOpen(false)} />
      <AutonomousRegistry open={registryOpen} onClose={() => setRegistryOpen(false)} />
      <EscalatedList open={escalationsOpen} onClose={() => setEscalationsOpen(false)} />
      <AutonomyControls open={controlsOpen} onClose={() => setControlsOpen(false)} />
    </main>
  );
}
