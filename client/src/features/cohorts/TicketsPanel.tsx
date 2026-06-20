import { useMemo, useState } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Disclosure } from "@/components/ui/Disclosure";
import { FilterChips, type ChipOption } from "@/components/ui/FilterChips";

export type IntentCount = { cohort_id: string; intent: string; n: number };

// F-3.3 / F-3.4 — raw ticket distribution intent × cohort, GROUPED by intent with a chip filter.
// Read-only crude count, NO cause classification, NO intake/close. k-anon suppression already
// applied server-side. Intents ordered by total volume desc; cohorts within by count desc — the
// biggest pain surfaces first. Each intent is a collapsible <details>.
export function TicketsPanel({ counts }: { counts: IntentCount[] }) {
  const groups = useMemo(() => {
    const m = new Map<string, IntentCount[]>();
    for (const c of counts) {
      const bucket = m.get(c.intent);
      if (bucket) bucket.push(c);
      else m.set(c.intent, [c]);
    }
    return [...m.entries()]
      .map(([intent, rows]) => ({
        intent,
        rows: [...rows].sort((a, b) => b.n - a.n),
        total: rows.reduce((s, r) => s + r.n, 0),
      }))
      .sort((a, b) => b.total - a.total || a.intent.localeCompare(b.intent));
  }, [counts]);

  const [active, setActive] = useState<Set<string>>(new Set());
  const toggle = (intent: string) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(intent)) next.delete(intent);
      else next.add(intent);
      return next;
    });
  const visible = active.size === 0 ? groups : groups.filter((g) => active.has(g.intent));
  const chipOptions: ChipOption[] = groups.map((g) => ({ key: g.intent, label: g.intent, count: g.total }));

  return (
    <Card ariaLabel="Ticket distribution">
      <CardTitle>Tickets (intent × cohort)</CardTitle>
      {groups.length === 0 ? (
        <EmptyState>No tickets in visible cells.</EmptyState>
      ) : (
        <>
          <p className="mb-3 text-xs text-mxm-content-secondary">
            Support tickets grouped by what the customer asked about. Open an intent, or filter.
          </p>
          <div className="mb-3">
            <FilterChips
              options={chipOptions}
              active={active}
              onToggle={toggle}
              onClear={() => setActive(new Set())}
              ariaLabel="Filter by intent"
            />
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {visible.map((g, i) => (
              <Disclosure key={`${g.intent}|${visible.length}`} title={g.intent} count={g.total} defaultOpen={i === 0}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-mxm-content-tertiary">
                      <th scope="col">Cohort</th>
                      <th scope="col" aria-sort="descending" className="text-right">
                        Count
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((c) => (
                      <tr key={`${c.cohort_id}:${c.intent}`} className="text-mxm-content">
                        <td className="text-mxm-content-secondary">{c.cohort_id}</td>
                        <td className="tabnum text-right">{c.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Disclosure>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
