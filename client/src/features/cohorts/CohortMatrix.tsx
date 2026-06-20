import { Fragment, useMemo, useState } from "react";
import type { CohortCell, DeltaRow } from "@shared/contracts";
import { Card, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FreshnessBadge } from "@/components/ui/FreshnessBadge";
import { FilterChips, type ChipOption } from "@/components/ui/FilterChips";
import { fmtNum } from "@/lib/utils";

// F-2.1 — the HERO of the awareness screen: a 2D heatmap (rows = cuisine × cols = zone, one block per
// tier) so the manager reads ALL cohort health in one look (§0 governing thought). Color is NEVER the
// sole carrier — each status has an icon + a text label; the technical token stays in `title` for
// engineers. k-anon: a suppressed cell never reveals its small n. Opportunity overlay = a coral marker
// on cells whose cohort carries a prioritized delta (join by cohort_id, gap_to_top from the producer,
// §14 — no invented intensity). Tiers collapse so the operator can focus one (e.g. just long-tail).
const META: Record<CohortCell["status"], { icon: string; label: string; tech: string; cls: string; varName: string }> = {
  ok: { icon: "●", label: "OK", tech: "ok", cls: "text-mxm-green", varName: "--mxm-systemGreen100" },
  collapsed: { icon: "◐", label: "Too few accounts", tech: "n<n_min", cls: "text-mxm-amber", varName: "--mxm-systemAmber100" },
  suppressed: { icon: "▢", label: "Hidden (privacy)", tech: "k-anon (suppressed)", cls: "text-mxm-red", varName: "--mxm-systemRed100" },
  pending: { icon: "○", label: "No data", tech: "pending", cls: "text-mxm-content-tertiary", varName: "--mxm-contentTertiary" },
};
const STATUS_ORDER: CohortCell["status"][] = ["ok", "collapsed", "suppressed", "pending"];
const TIERS = ["managed_brand", "managed_midmarket", "long_tail"] as const;
const TIER_LABEL: Record<string, string> = {
  managed_brand: "Managed · Brand",
  managed_midmarket: "Managed · Midmarket",
  long_tail: "Long-tail",
};
const uniqSort = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => x != null))].sort();

// Coral marks WHERE TO ACT, not everywhere — cap the overlay to the top opportunities so the accent
// stays meaningful (DESIGN-STANDARD §1). The full ranking lives in OpportunitiesPanel.
const TOP_OPPORTUNITIES = 12;
type Opp = { gap: number | null; atRisk: boolean };
function rankOpp(a: Opp, b: Opp): number {
  if (a.atRisk !== b.atRisk) return a.atRisk ? -1 : 1;
  return (b.gap ?? -Infinity) - (a.gap ?? -Infinity);
}
function buildOppMap(deltas: DeltaRow[]): Map<string, Opp> {
  const byCohort = new Map<string, Opp>();
  for (const d of deltas) {
    const cur = byCohort.get(d.cohort_id);
    const g = Math.max(cur?.gap ?? -Infinity, d.gap_to_top ?? -Infinity);
    byCohort.set(d.cohort_id, { gap: g === -Infinity ? null : g, atRisk: (cur?.atRisk ?? false) || d.delta_status === "at_risk" });
  }
  return new Map([...byCohort.entries()].sort((a, b) => rankOpp(a[1], b[1])).slice(0, TOP_OPPORTUNITIES));
}

function Cell({ c, opp, onOpen }: { c: CohortCell; opp?: Opp; onOpen?: (c: CohortCell) => void }) {
  const m = META[c.status];
  const n = c.status === "suppressed" ? "—" : (c.n_accounts ?? "—"); // k-anon: never reveal a small n
  const tint =
    c.status === "pending"
      ? undefined
      : {
          background: `color-mix(in srgb, var(${m.varName}) 9%, var(--mxm-backgroundPrimaryElevated))`,
          borderColor: opp
            ? `color-mix(in srgb, var(--mxm-paletteBrand100) 55%, var(--mxm-borderPrimary))`
            : `color-mix(in srgb, var(${m.varName}) 28%, var(--mxm-borderPrimary))`,
        };
  const body = (
    <>
      {opp && <span aria-hidden="true" className="absolute right-0 top-0 h-0 w-0 border-l-[16px] border-t-[16px] border-l-transparent" style={{ borderTopColor: "var(--mxm-paletteBrand100)", borderStartEndRadius: "9px" }} />}
      <span className={`flex items-center gap-1 text-xs font-semibold ${m.cls}`}>
        <span aria-hidden="true">{m.icon}</span> {m.label}
      </span>
      <span className="tabnum block text-xs text-mxm-content-tertiary">n = {n}</span>
      {opp && (
        <span title="gap to top" className="tabnum mt-0.5 self-start rounded border border-mxm-brand px-1 text-[0.7rem] font-bold text-mxm-brand">
          gap {opp.gap == null ? "—" : fmtNum(opp.gap)}
        </span>
      )}
      <FreshnessBadge freshness={c.freshness_ts} stale={c.stale} />
    </>
  );
  const cls = "relative flex min-h-[64px] w-full flex-col gap-0.5 rounded-mxm border border-mxm-border p-2 text-left";
  if (c.status === "pending")
    return (
      <div className={`${cls} opacity-70`} title={m.tech}>
        {body}
      </div>
    );
  return (
    <button
      onClick={() => onOpen?.(c)}
      title={m.tech}
      style={tint}
      aria-label={`${c.cuisine ?? "—"} · ${c.zone ?? "—"} · ${c.tier_base}: ${m.label}, n=${n}`}
      className={`${cls} transition-transform hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand`}
    >
      {body}
    </button>
  );
}

function TierBlock({
  tier,
  cells,
  oppMap,
  onOpen,
  open,
  onToggle,
}: {
  tier: string;
  cells: CohortCell[];
  oppMap: Map<string, Opp>;
  onOpen?: (c: CohortCell) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const zones = uniqSort(cells.map((c) => c.zone));
  const cuisines = uniqSort(cells.map((c) => c.cuisine));
  const byKey = new Map(cells.map((c) => [`${c.cuisine}|${c.zone}`, c]));
  const cols = `minmax(56px,auto) repeat(${zones.length}, minmax(0,1fr))`;
  return (
    <section className="mb-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 py-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand"
      >
        <span aria-hidden="true" className={`text-xs text-mxm-content-tertiary transition-transform ${open ? "" : "-rotate-90"}`}>▾</span>
        <span className="text-xs uppercase tracking-wide text-mxm-content-tertiary">{TIER_LABEL[tier] ?? tier}</span>
        <span className="tabnum text-xs text-mxm-content-tertiary">{cells.length}</span>
        <span className="ml-1 h-px flex-1 bg-mxm-border" />
      </button>

      {open && (
        <div className="grid gap-1.5" style={{ gridTemplateColumns: cols }}>
          <div />
          {zones.map((z) => (
            <div key={z} className="self-end pb-0.5 text-center text-[0.72rem] capitalize text-mxm-content-tertiary">{z}</div>
          ))}
          {cuisines.map((cu) => (
            <Fragment key={cu}>
              <div className="self-center pr-2 text-right text-xs capitalize text-mxm-content-secondary">{cu}</div>
              {zones.map((z) => {
                const c = byKey.get(`${cu}|${z}`);
                return c ? (
                  <Cell key={z} c={c} opp={oppMap.get(c.cohort_id)} onOpen={onOpen} />
                ) : (
                  <div key={z} aria-hidden="true" className="grid min-h-[64px] place-items-center rounded-mxm border border-dashed border-mxm-border text-mxm-border">·</div>
                );
              })}
            </Fragment>
          ))}
        </div>
      )}
    </section>
  );
}

export function CohortMatrix({
  cells,
  deltas = [],
  onOpen,
}: {
  cells: CohortCell[];
  deltas?: DeltaRow[];
  onOpen?: (c: CohortCell) => void;
}) {
  const [active, setActive] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const oppMap = useMemo(() => buildOppMap(deltas), [deltas]);

  const toggleStatus = (s: string) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  const toggleTier = (t: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const statusOptions: ChipOption[] = useMemo(
    () =>
      STATUS_ORDER.map((s) => ({ s, n: cells.filter((c) => c.status === s).length }))
        .filter((x) => x.n > 0)
        .map((x) => ({ key: x.s, label: META[x.s].label, count: x.n })),
    [cells],
  );
  const filtered = active.size === 0 ? cells : cells.filter((c) => active.has(c.status));
  const tiers = useMemo(() => TIERS.filter((t) => filtered.some((c) => c.tier_base === t)), [filtered]);

  if (cells.length === 0)
    return (
      <Card ariaLabel="Cohort health heatmap">
        <CardTitle>Cohort health</CardTitle>
        <EmptyState>No cohorts computed. Run the flow.</EmptyState>
      </Card>
    );

  return (
    <Card ariaLabel="Cohort health heatmap">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <CardTitle>Cohort health</CardTitle>
        <p className="text-xs text-mxm-content-secondary">cuisine × zone, per tier — color = status, coral = where to act</p>
      </div>

      <div className="mb-2">
        <FilterChips options={statusOptions} active={active} onToggle={toggleStatus} onClear={() => setActive(new Set())} ariaLabel="Filter by status" />
      </div>

      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.72rem] text-mxm-content-tertiary">
        {STATUS_ORDER.map((s) => (
          <li key={s} className="flex items-center gap-1">
            <span aria-hidden="true" className={META[s].cls}>{META[s].icon}</span> {META[s].label}
          </li>
        ))}
        <li className="flex items-center gap-1">
          <span aria-hidden="true" className="text-mxm-brand">◤</span> Prioritized opportunity (gap to top)
        </li>
      </ul>

      {tiers.length === 0 ? (
        <EmptyState>No cohorts match this filter.</EmptyState>
      ) : (
        tiers.map((t) => (
          <TierBlock
            key={t}
            tier={t}
            cells={filtered.filter((c) => c.tier_base === t)}
            oppMap={oppMap}
            onOpen={onOpen}
            open={!collapsed.has(t)}
            onToggle={() => toggleTier(t)}
          />
        ))
      )}
    </Card>
  );
}
