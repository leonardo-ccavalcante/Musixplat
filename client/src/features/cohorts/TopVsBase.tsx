import { Card, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

type Band = { n: number; avg_metric: number; avg_ticket: number };
export type Baseline = { top?: Band; base?: Band; dimensions?: string[] } | null;

// F-1.6 — top-vs-base comparison by canonical dimension. Read-only; never recomputes baselines.
// Suppressed/NULL ⇒ conservative empty, never fabricated zeros.
export function TopVsBase({ baseline, suppressed }: { baseline: Baseline; suppressed?: boolean }) {
  if (suppressed) {
    return (
      <Card ariaLabel="Comparación topo vs base">
        <CardTitle>Topo vs Base</CardTitle>
        <EmptyState>Celda suprimida por k-anonimidad.</EmptyState>
      </Card>
    );
  }
  if (!baseline?.top || !baseline?.base) {
    return (
      <Card ariaLabel="Comparación topo vs base">
        <CardTitle>Topo vs Base</CardTitle>
        <EmptyState>Sin baseline calculado.</EmptyState>
      </Card>
    );
  }
  const dims: Array<{ key: keyof Band; label: string }> = [
    { key: "n", label: "Cuentas" },
    { key: "avg_metric", label: "Recurrencia media" },
    { key: "avg_ticket", label: "Ticket medio" },
  ];
  return (
    <Card ariaLabel="Comparación topo vs base">
      <CardTitle>Topo vs Base</CardTitle>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-mxm-content-tertiary">
            <th scope="col">Dimensión</th>
            <th scope="col" className="text-right">
              Topo (P90+)
            </th>
            <th scope="col" className="text-right">
              Base
            </th>
          </tr>
        </thead>
        <tbody>
          {dims.map((d) => (
            <tr key={d.key} className="text-mxm-content">
              <th scope="row" className="text-left font-normal text-mxm-content-secondary">
                {d.label}
              </th>
              <td className="tabnum text-right">{baseline.top![d.key]}</td>
              <td className="tabnum text-right">{baseline.base![d.key]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
