import { EmptyState } from "@/components/ui/EmptyState";
import { HandoffButton } from "./HandoffButton";

export type DrillRow = {
  restaurante_id: string;
  cohort_id: string;
  subgrupo_id: string | null;
  semana: string;
  percentil_en_cohort: number | null;
  gap_hasta_top: number | null;
  modo: string | null;
};

// F-5.1 — drill: accounts ordered by gap (server-ordered). Each row offers the F-5.2 handoff.
// Keyboard-navigable table; NULL passes through as —.
export function DrillTable({ rows }: { rows: DrillRow[] }) {
  if (rows.length === 0) return <EmptyState>Celda vacía.</EmptyState>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-mxm-content-tertiary">
          <th scope="col">Restaurante</th>
          <th scope="col" className="text-right">
            Percentil
          </th>
          <th scope="col" aria-sort="descending" className="text-right">
            Gap
          </th>
          <th scope="col">Acción</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.restaurante_id} className="text-mxm-content">
            <td>{r.restaurante_id}</td>
            <td className="tabnum text-right">{r.percentil_en_cohort ?? "—"}</td>
            <td className="tabnum text-right">{r.gap_hasta_top ?? "—"}</td>
            <td>
              <HandoffButton
                restaurante_id={r.restaurante_id}
                cohort_id={r.cohort_id}
                subgrupo_id={r.subgrupo_id}
                semana={r.semana}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
