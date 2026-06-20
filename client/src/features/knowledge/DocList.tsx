import type { DocRow } from "@shared/contracts_knowledge";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/EmptyState";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";

// P06 — the knowledge base, in view. Provenance is per field (§3.10): a `proposed` type is the AI's
// inference ([I]); a `confirmed` type is human-verified ([V]); a `parse_failed` doc produced NO type,
// so it carries no provenance badge (§14 — nothing rendered for a value that was never produced).
// Loading / empty / error are explicit — never a green-fake (§4).
function provFor(status: string): "[I]" | "[V]" | null {
  if (status === "confirmed") return "[V]";
  if (status === "proposed") return "[I]";
  return null; // parse_failed (or anything else) ⇒ no produced type ⇒ no badge
}

// Human status label — the screen speaks the operator's language, never raw enum jargon (DESIGN-STANDARD §7).
function statusLabel(status: string): string {
  if (status === "confirmed") return "Confirmed";
  if (status === "proposed") return "Suggested";
  if (status === "parse_failed") return "Could not read";
  return status;
}

export function DocList({
  rows,
  isLoading,
  isError,
}: {
  rows: DocRow[];
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) return <LoadingState label="Loading documents…" />;
  if (isError) return <ErrorState label="Failed to load documents" />;
  if (rows.length === 0) return <EmptyState>No documents yet — upload one to grow the base.</EmptyState>;

  // Roomy card rows, not a data-grid (DESIGN-STANDARD §7 [OPERATOR CONFIRMED]: /knowledge is a narrative
  // screen). Each card shows the filename, the type + its provenance ([I] suggested / [V] confirmed), and a
  // human status — breathing room over density.
  return (
    <ul aria-label="Knowledge base documents" className="space-y-2.5">
      {rows.map((r) => {
        const prov = provFor(r.status);
        const failed = r.status === "parse_failed";
        return (
          <li
            key={r.docId}
            className="flex items-start justify-between gap-4 rounded-mxm border border-mxm-border px-4 py-3.5"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-mxm-content">{r.filename}</p>
              <div className="mt-1 flex items-center gap-1.5 text-sm">
                {r.docType ? (
                  <>
                    <span className="text-mxm-content-secondary">{r.docType}</span>
                    {prov && <ProvenanceBadge prov={prov} />}
                  </>
                ) : (
                  <span className="text-mxm-content-tertiary">Not added to the base</span>
                )}
              </div>
            </div>
            <span
              className={
                failed
                  ? "shrink-0 text-xs font-medium text-mxm-red"
                  : "shrink-0 text-xs text-mxm-content-tertiary"
              }
            >
              {statusLabel(r.status)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
