import { Card, CardTitle } from "@/components/ui/Card";

export type MoneySummary = {
  hasSignal: boolean;
  value: string | null;
  seal: "confirmed" | "provisional" | "unreliable";
  freshness: string | null;
};

// F-3.1 / F-3.2 — money panel. Reads/links; NEVER recalculates. no signal ⇒ conservative state
// with seal, never a fabricated gross/estimate (§14). The seal carries meaning via text, not color.
const SEAL_CLS: Record<MoneySummary["seal"], string> = {
  confirmed: "text-mxm-green",
  provisional: "text-mxm-amber",
  unreliable: "text-mxm-content-tertiary",
};

export function MoneyPanel({ summary }: { summary: MoneySummary }) {
  return (
    <Card ariaLabel="Money panel">
      <CardTitle>Attributable business impact</CardTitle>
      {summary.hasSignal ? (
        <div>
          <p className="tabnum text-2xl text-mxm-content">{summary.value}</p>
          <p className={`text-xs ${SEAL_CLS[summary.seal]}`}>
            seal: {summary.seal} · {summary.freshness ?? "—"}
          </p>
        </div>
      ) : (
        <div>
          <p className="text-2xl text-mxm-content-tertiary">—</p>
          <p className={`text-xs ${SEAL_CLS[summary.seal]}`} role="status">
            no signal: {summary.seal} (no gross/estimate shown)
          </p>
        </div>
      )}
    </Card>
  );
}
