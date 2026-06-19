import { useMemo } from "react";
import type { CohortCell } from "@shared/contracts";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { FreshnessBadge } from "@/components/ui/FreshnessBadge";

// A clicked matrix header (a tier / cuisine / zone) defines a SEGMENT — the slice of cohorts that
// share that axis value. Shared between the matrix (emits) and this modal (consumes).
export type SegmentFilter = { kind: "tier" | "cuisine" | "zone"; value: string };

const KIND_LABEL: Record<SegmentFilter["kind"], string> = {
  tier: "Tier",
  cuisine: "Cuisine",
  zone: "Zone",
};

const STATUS_META: Record<CohortCell["status"], { icon: string; label: string; cls: string }> = {
  ok: { icon: "●", label: "OK", cls: "text-mxm-green" },
  collapsed: { icon: "◐", label: "n<n_min", cls: "text-mxm-amber" },
  suppressed: { icon: "▢", label: "k-anon", cls: "text-mxm-red" },
  pending: { icon: "○", label: "no data", cls: "text-mxm-content-tertiary" },
};

function matches(c: CohortCell, f: SegmentFilter): boolean {
  if (f.kind === "tier") return c.tier_base === f.value;
  if (f.kind === "cuisine") return c.cuisine === f.value;
  return c.zone === f.value;
}

// F-2.1 drill-by-segment — click a matrix axis header (e.g. "managed_brand", "brazilian") to see
// every cohort on that slice in one elegant list, each row a button into the full F-4.1 detail.
// Read-only projection over the already-loaded cells (no extra query). k-anon respected: a
// suppressed cell never reveals its n_accounts (re-identification, §3.2).
export function SegmentModal({
  filter,
  cells,
  onOpenCell,
  onClose,
}: {
  filter: SegmentFilter | null;
  cells: CohortCell[];
  onOpenCell: (c: CohortCell) => void;
  onClose: () => void;
}) {
  const rows = useMemo(() => {
    if (!filter) return [];
    return cells
      .filter((c) => matches(c, filter))
      .sort((a, b) => (b.n_accounts ?? -1) - (a.n_accounts ?? -1));
  }, [filter, cells]);

  return (
    <Modal
      open={!!filter}
      onClose={onClose}
      title={filter ? `${KIND_LABEL[filter.kind]}: ${filter.value}` : ""}
    >
      {filter && (
        <div className="space-y-2">
          <p className="text-xs text-mxm-content-secondary">
            {rows.length} cohort{rows.length === 1 ? "" : "s"} in this segment — open one for its profile,
            upside and accounts.
          </p>
          {rows.length === 0 ? (
            <EmptyState>No cohorts in this segment.</EmptyState>
          ) : (
            <ul className="space-y-1.5">
              {rows.map((c) => {
                const m = STATUS_META[c.status];
                const n = c.status === "suppressed" ? "—" : (c.n_accounts ?? "—");
                return (
                  <li key={c.cohort_id}>
                    <button
                      onClick={() => onOpenCell(c)}
                      className="flex w-full items-center gap-3 rounded-mxm border border-mxm-border px-3 py-2.5 text-left hover:bg-mxm-bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand"
                    >
                      <span className={`shrink-0 text-xs ${m.cls}`}>
                        <span aria-hidden="true">{m.icon}</span> {m.label}
                      </span>
                      <span className="flex-1 truncate text-sm text-mxm-content">
                        {c.cuisine ?? "—"} · {c.zone ?? "—"} · {c.tier_base}
                      </span>
                      <span className="tabnum shrink-0 text-xs text-mxm-content-tertiary">n = {n}</span>
                      <FreshnessBadge freshness={c.freshness_ts} stale={c.stale} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
