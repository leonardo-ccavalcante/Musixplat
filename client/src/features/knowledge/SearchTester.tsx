import { useState } from "react";
import type { SearchHit } from "@shared/contracts_knowledge";
import { Button } from "@/components/ui/Button";
import { LoadingState, ErrorState } from "@/components/ui/EmptyState";

// P06 — the search tester is the visible proof that "we run it against the base to see if we hold this
// shape" (Leo). Submitting fires onSearch(query); the page runs `knowledge.search` (tenant scoped
// server-side). A hit shows filename · docType · similarity · snippet — retrieval, in view (§5). A
// search that returns nothing shows an explicit no-match, never a fabricated hit (§3.7 / §4).
export function SearchTester({
  hits,
  hasSearched,
  isLoading,
  isError,
  onSearch,
}: {
  hits: SearchHit[];
  hasSearched: boolean;
  isLoading: boolean;
  isError: boolean;
  onSearch: (query: string) => void;
}) {
  const [q, setQ] = useState("");

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) return; // fail-closed — no blank search
    onSearch(trimmed);
  }

  return (
    <section aria-label="Search tester" className="space-y-3">
      <form role="search" onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <label htmlFor="kb-search" className="sr-only">
          Search the knowledge base
        </label>
        <input
          id="kb-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask the base — e.g. refund window"
          className="min-w-0 flex-1 rounded-mxm border border-mxm-border bg-mxm-bg px-3 py-2 text-sm text-mxm-content placeholder:text-mxm-content-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand"
        />
        <Button type="submit" disabled={isLoading || !q.trim()}>
          {isLoading ? "Searching…" : "Search"}
        </Button>
      </form>

      {isLoading ? (
        <LoadingState label="Searching the base…" />
      ) : isError ? (
        <ErrorState label="Search failed — no hit fabricated" />
      ) : hasSearched && hits.length === 0 ? (
        <p role="status" className="py-4 text-sm text-mxm-content-tertiary">
          No match — the base does not hold this shape yet.
        </p>
      ) : hits.length > 0 ? (
        <ul aria-label="Search results" className="space-y-2">
          {hits.map((h) => (
            <li key={h.chunkId} className="rounded-mxm border border-mxm-border px-3 py-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="font-medium text-mxm-content">{h.filename}</span>
                {h.docType && (
                  <span className="rounded border border-mxm-border px-1.5 text-mxm-content-secondary">
                    {h.docType}
                  </span>
                )}
                <span className="text-mxm-content-tertiary" title="cosine similarity">
                  {(h.similarity * 100).toFixed(0)}% match
                </span>
              </div>
              <p className="mt-1.5 break-words text-sm text-mxm-content-secondary">{h.content}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
