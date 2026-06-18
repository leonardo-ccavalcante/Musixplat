import { Card, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

type TopoVsBasePair = {
  n_top: number | null;
  n_base: number | null;
  d_orders: number | null;
  d_connection: number | null;
  d_quality: number | null;
  d_cancel: number | null;
};
export type Baseline = { topo_vs_base?: { p90_vs_p10?: TopoVsBasePair } } | null;

// F-1.6 — top-vs-base comparison by canonical dimension. Read-only; never recomputes baselines.
// Suppressed/NULL ⇒ conservative empty, never fabricated zeros.
export function TopVsBase({ baseline, suppressed }: { baseline: Baseline; suppressed?: boolean }) {
  if (suppressed) {
    return (
      <Card ariaLabel="Top-vs-base comparison">
        <CardTitle>Top vs Base</CardTitle>
        <EmptyState>Cell suppressed by k-anonymity.</EmptyState>
      </Card>
    );
  }
  const pair = baseline?.topo_vs_base?.p90_vs_p10;
  if (!pair) {
    return (
      <Card ariaLabel="Top-vs-base comparison">
        <CardTitle>Top vs Base</CardTitle>
        <EmptyState>No baseline computed.</EmptyState>
      </Card>
    );
  }
  const dims: Array<{ key: keyof TopoVsBasePair; label: string }> = [
    { key: "n_top", label: "Top accounts" },
    { key: "n_base", label: "Base accounts" },
    { key: "d_orders", label: "Delta orders" },
    { key: "d_connection", label: "Delta connection" },
    { key: "d_quality", label: "Delta quality" },
    { key: "d_cancel", label: "Delta cancel" },
  ];
  return (
    <Card ariaLabel="Top-vs-base comparison">
      <CardTitle>Top vs Base</CardTitle>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-mxm-content-tertiary">
            <th scope="col">Dimension</th>
            <th scope="col" className="text-right">
              P90 vs P10
            </th>
          </tr>
        </thead>
        <tbody>
          {dims.map((d) => (
            <tr key={d.key} className="text-mxm-content">
              <th scope="row" className="text-left font-normal text-mxm-content-secondary">
                {d.label}
              </th>
              <td className="tabnum text-right">{pair[d.key] ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
