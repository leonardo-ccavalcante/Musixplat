import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { CockpitRow, type RowAction, type RowState } from "./CockpitRow";
import type { NbaCockpitRow } from "@shared/contracts";

// A titled section with a count pill. accent = the action queue (brand), else the calm auto list.
function Section({ title, count, accent, children }: { title: string; count: number; accent?: boolean; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-mxm border border-mxm-border bg-mxm-bg-elevated">
      <header className="flex items-center gap-2 border-b border-mxm-border px-[clamp(0.75rem,1.5vw,1.25rem)] py-3">
        <h2 className="text-lg font-semibold text-mxm-content">{title}</h2>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums",
            accent ? "border-mxm-brand text-mxm-brand" : "border-mxm-border text-mxm-content-secondary",
          )}
        >
          {count}
        </span>
      </header>
      <div className="px-[clamp(0.75rem,1.5vw,1.25rem)]">{children}</div>
    </section>
  );
}

// 02:EPIC-1 / F-1.1 — the cockpit, organized by what the operator must DO (the 1:10 job is surfacing the
// exceptions), not by cohort: a prominent "Needs your decision" queue first, then the calm "Auto-handled"
// list. Each row carries its cohort as context (F-1.1 cohort dimension preserved as a column, not a card —
// clarity over a 30-card mosaic). Presentational: the page injects rows + onAction + per-row action state.
export function CockpitBoard({
  rows,
  onAction,
  onOpen,
  actionState,
}: {
  rows: NbaCockpitRow[];
  onAction: (row: NbaCockpitRow, action: RowAction) => void;
  onOpen?: (row: NbaCockpitRow) => void;
  actionState: Record<string, RowState | undefined>;
}) {
  if (rows.length === 0) return <EmptyState>The AI has proposed no actions yet.</EmptyState>;

  const human = rows.filter((r) => r.status === "needs_human");
  const auto = rows.filter((r) => r.status === "auto");

  return (
    <div className="grid gap-[clamp(1rem,2vw,1.5rem)]">
      <Section title="Needs your decision" count={human.length} accent>
        {human.length === 0 ? (
          <p className="py-3 text-sm text-mxm-content-secondary">Nothing needs you right now — the AI has it.</p>
        ) : (
          human.map((r) => (
            <CockpitRow key={r.nba_id} row={r} onAction={onAction} onOpen={onOpen} state={actionState[r.nba_id]} />
          ))
        )}
      </Section>

      <Section title="Auto-handled by the AI" count={auto.length}>
        {auto.length === 0 ? (
          <p className="py-3 text-sm text-mxm-content-secondary">No actions cleared for autonomy yet.</p>
        ) : (
          auto.map((r) => (
            <CockpitRow key={r.nba_id} row={r} onAction={onAction} onOpen={onOpen} state={actionState[r.nba_id]} muted />
          ))
        )}
      </Section>
    </div>
  );
}
