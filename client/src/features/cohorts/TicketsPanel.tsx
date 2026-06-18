import { Card, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export type IntentCount = { cohort_id: string; intent: string; n: number };

// F-3.3 / F-3.4 — raw ticket distribution intent × cohort. Read-only crude count, NO cause
// classification, NO intake/close. k-anon suppression already applied server-side.
export function TicketsPanel({ counts }: { counts: IntentCount[] }) {
  return (
    <Card ariaLabel="Ticket distribution">
      <CardTitle>Tickets (intent × cohort)</CardTitle>
      {counts.length === 0 ? (
        <EmptyState>No tickets in visible cells.</EmptyState>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-mxm-content-tertiary">
              <th scope="col">Cohort</th>
              <th scope="col">Intent</th>
              <th scope="col" className="text-right">
                Count
              </th>
            </tr>
          </thead>
          <tbody>
            {counts.map((c) => (
              <tr key={`${c.cohort_id}:${c.intent}`} className="text-mxm-content">
                <td className="text-mxm-content-secondary">{c.cohort_id}</td>
                <td>{c.intent}</td>
                <td className="tabnum text-right">{c.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
