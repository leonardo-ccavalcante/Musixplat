import { useMemo } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Disclosure } from "@/components/ui/Disclosure";

export type IntentCount = { cohort_id: string; intent: string; n: number };

// F-3.3 / F-3.4 — raw ticket distribution intent × cohort, GROUPED by intent. Read-only crude
// count, NO cause classification, NO intake/close. k-anon suppression already applied server-side.
// Intents ordered by total volume desc; cohorts within an intent ordered by count desc — the
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

  return (
    <Card ariaLabel="Ticket distribution">
      <CardTitle>Tickets (intent × cohort)</CardTitle>
      {groups.length === 0 ? (
        <EmptyState>No tickets in visible cells.</EmptyState>
      ) : (
        <div className="space-y-2">
          {groups.map((g, i) => (
            <Disclosure key={g.intent} title={g.intent} count={g.total} defaultOpen={i === 0}>
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
      )}
    </Card>
  );
}
