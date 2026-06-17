import { Card, CardTitle } from "@/components/ui/Card";

export type MoneySummary = {
  hasSignal: boolean;
  value: string | null;
  sello: "confirmado" | "provisional" | "no-confiable";
  freshness: string | null;
};

// F-3.1 / F-3.2 — money panel. Reads/links; NEVER recalculates. sin señal ⇒ conservative state
// with sello, never a gross/estimado fabricado (§14). Sello carries meaning via text, not color.
const SELLO_CLS: Record<MoneySummary["sello"], string> = {
  confirmado: "text-mxm-green",
  provisional: "text-mxm-amber",
  "no-confiable": "text-mxm-content-tertiary",
};

export function MoneyPanel({ summary }: { summary: MoneySummary }) {
  return (
    <Card ariaLabel="Panel de dinero">
      <CardTitle>Impacto de negocio atribuible</CardTitle>
      {summary.hasSignal ? (
        <div>
          <p className="tabnum text-2xl text-mxm-content">{summary.value}</p>
          <p className={`text-xs ${SELLO_CLS[summary.sello]}`}>
            sello: {summary.sello} · {summary.freshness ?? "—"}
          </p>
        </div>
      ) : (
        <div>
          <p className="text-2xl text-mxm-content-tertiary">—</p>
          <p className={`text-xs ${SELLO_CLS[summary.sello]}`} role="status">
            sin señal: {summary.sello} (no se muestra gross/estimado)
          </p>
        </div>
      )}
    </Card>
  );
}
