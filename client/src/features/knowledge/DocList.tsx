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

  return (
    <div className="overflow-x-auto rounded-mxm border border-mxm-border">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Knowledge base documents</caption>
        <thead className="border-b border-mxm-border text-xs text-mxm-content-secondary">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              File
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Type
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-mxm-border">
          {rows.map((r) => {
            const prov = provFor(r.status);
            return (
              <tr key={r.docId}>
                <td className="px-3 py-2 text-mxm-content">{r.filename}</td>
                <td className="px-3 py-2">
                  {r.docType ? (
                    <span className="inline-flex items-center gap-1.5 text-mxm-content">
                      {r.docType}
                      {prov && <ProvenanceBadge prov={prov} />}
                    </span>
                  ) : (
                    <span className="text-mxm-content-tertiary">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={
                      r.status === "parse_failed" ? "text-mxm-red" : "text-mxm-content-secondary"
                    }
                  >
                    {r.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
