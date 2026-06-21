import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { CockpitRow, type RowAction, type RowState, type KbReview } from "./CockpitRow";
import { NBA_LABEL } from "./nbaCatalog";
import type { NbaCockpitRow } from "@shared/contracts";

export type GroupBy = "why" | "level" | "action";
export type GroupTone = "money" | "level" | "gate" | "auto" | "neutral";
export interface GroupView {
  key: string;
  title: string;
  why: string;
  tone: GroupTone;
  isQueue: boolean; // contains rows that need the human → accent the count pill
  defaultOpen: boolean;
  rows: NbaCockpitRow[];
}

const WHY = {
  money: { title: "Touches money — you decide", why: "Financial hard-no: the AI may only propose; you release the money.", tone: "money" as const },
  level: { title: "Escalated above low autonomy", why: "Autonomy is above LOW — release at the granted level or clamp it down.", tone: "level" as const },
  gates: { title: "Held by a gate", why: "A sample-size / policy / k-anon gate isn't satisfied — held, fail-closed.", tone: "gate" as const },
};
const LVL = {
  HIGH: { why: "The AI would act most independently here.", tone: "level" as const, open: true },
  MEDIUM: { why: "Partial autonomy — escalated for your call.", tone: "level" as const, open: true },
  LOW: { why: "Lowest-stakes — mostly auto-cleared.", tone: "auto" as const, open: false },
};

// Pure grouping by the chosen axis — DB-free, unit-testable. Order encodes urgency (queue first, calm last);
// empty groups are dropped. The autonomy NUMBER (effective_level) is read, never recomputed (§14).
export function groupRows(rows: NbaCockpitRow[], by: GroupBy): GroupView[] {
  if (by === "why") {
    const out: GroupView[] = [];
    for (const k of ["money", "level", "gates"] as const) {
      const rs = rows.filter((r) => r.status === "needs_human" && r.reason === k);
      // open the ACTIVE decisions (money, escalated level); a gate hold is system-held, lower priority → folds.
      if (rs.length) out.push({ key: k, ...WHY[k], isQueue: true, defaultOpen: k !== "gates", rows: rs });
    }
    const auto = rows.filter((r) => r.status === "auto");
    if (auto.length) out.push({ key: "auto", title: "Auto-handled by the AI", why: "Cleared for autonomy — the AI is acting on these. You can still pause any.", tone: "auto", isQueue: false, defaultOpen: false, rows: auto });
    return out;
  }
  if (by === "level") {
    const out: GroupView[] = [];
    for (const k of ["HIGH", "MEDIUM", "LOW"] as const) {
      const rs = rows.filter((r) => r.effective_level === k);
      if (rs.length) out.push({ key: k, title: `${k} autonomy`, why: LVL[k].why, tone: LVL[k].tone, isQueue: rs.some((r) => r.status === "needs_human"), defaultOpen: LVL[k].open, rows: rs });
    }
    const none = rows.filter((r) => r.effective_level == null);
    if (none.length) out.push({ key: "uncomputed", title: "Not computed yet", why: "Held by a gate before autonomy resolved — rendered conservatively (§14).", tone: "gate", isQueue: true, defaultOpen: false, rows: none });
    return out;
  }
  // by action — one band per catalog code (mixed autonomy), good for "what are these NBAs"
  const codes = [...new Set(rows.map((r) => r.action_type ?? "—"))].sort();
  return codes.map((code) => {
    const rs = rows.filter((r) => (r.action_type ?? "—") === code);
    return { key: code, title: NBA_LABEL[code] ?? code, why: `${code} · ${rs.length} cohort${rs.length > 1 ? "s" : ""} with this action`, tone: "neutral" as const, isQueue: rs.some((r) => r.status === "needs_human"), defaultOpen: true, rows: rs };
  });
}

const TONE_BAR: Record<GroupTone, string> = {
  money: "bg-mxm-red",
  level: "bg-mxm-amber",
  gate: "bg-mxm-content-tertiary",
  auto: "bg-mxm-green",
  neutral: "bg-mxm-border",
};

// 02:EPIC-1 / F-1.1 — the cockpit queue, grouped by the chosen axis so the autonomy verdict (the hero) is
// legible: each band names WHY it's grouped, carries a count, and folds open/closed (controlled, so the page
// can expand/collapse all). Presentational: rows + onAction + per-row state + open map are injected.
export function CockpitBoard({
  groups,
  openGroups,
  onToggle,
  onAction,
  onOpen,
  actionState,
  kbReviews,
}: {
  groups: GroupView[];
  openGroups: Record<string, boolean>;
  onToggle: (key: string) => void;
  onAction: (row: NbaCockpitRow, action: RowAction) => void;
  onOpen?: (row: NbaCockpitRow) => void;
  actionState: Record<string, RowState | undefined>;
  kbReviews?: Record<string, KbReview | undefined>;
}) {
  if (groups.length === 0) return <EmptyState>The AI has proposed no actions yet.</EmptyState>;

  return (
    <div className="grid gap-[clamp(0.75rem,1.5vw,1.25rem)]">
      {groups.map((g) => {
        const open = openGroups[g.key] ?? g.defaultOpen;
        return (
          <details key={g.key} open={open} className="overflow-hidden rounded-mxm border border-mxm-border bg-mxm-bg-elevated">
            <summary
              onClick={(e) => {
                e.preventDefault();
                onToggle(g.key);
              }}
              className="flex cursor-pointer list-none items-center gap-3 px-[clamp(0.75rem,1.5vw,1.25rem)] py-3 hover:bg-mxm-bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mxm-brand [&::-webkit-details-marker]:hidden"
            >
              <span aria-hidden className={cn("h-7 w-[3px] shrink-0 rounded-full", TONE_BAR[g.tone])} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-mxm-content">{g.title}</span>
                <span className="block truncate text-xs text-mxm-content-secondary">{g.why}</span>
              </span>
              <span
                className={cn(
                  "tabnum shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold",
                  g.isQueue ? "border-mxm-brand text-mxm-brand" : "border-mxm-border text-mxm-content-secondary",
                )}
              >
                {g.rows.length}
              </span>
              <span aria-hidden className="shrink-0 text-mxm-content-tertiary transition-transform duration-150 [details[open]>summary>&]:rotate-90">
                ▸
              </span>
            </summary>
            <div className="border-t border-mxm-border px-[clamp(0.75rem,1.5vw,1.25rem)]">
              {g.rows.map((r) => (
                <CockpitRow key={r.nba_id} row={r} onAction={onAction} onOpen={onOpen} state={actionState[r.nba_id]} muted={r.status === "auto"} kbReview={kbReviews?.[r.nba_id]} />
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
