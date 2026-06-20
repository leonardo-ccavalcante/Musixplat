import { useState } from "react";
import type { AskResult } from "@shared/contracts_knowledge";
import { Button } from "@/components/ui/Button";
import { LoadingState, ErrorState } from "@/components/ui/EmptyState";

// P06 — "Ask the base": the Q&A chatbot (the "G" of RAG). The operator asks; the AI answers GROUNDED in
// the retrieved passages and CITES the source docs (cite-don't-assert, DESIGN-STANDARD §3). No relevant
// passage ⇒ an honest "not in the base", never a fabricated answer (§3.7). The supporting snippets are the
// visible "why" behind the answer (progressive disclosure). Submitting fires onAsk(query); the page runs
// `knowledge.ask` (tenant scoped server-side). Numbers never come from the LLM (§3.6) — it only writes text.
function matchLabel(sim: number): string {
  return sim >= 0.75 ? "Strong" : sim >= 0.5 ? "Partial" : "Weak";
}

export function SearchTester({
  result,
  hasSearched,
  isLoading,
  isError,
  onSearch,
}: {
  result: AskResult | null;
  hasSearched: boolean;
  isLoading: boolean;
  isError: boolean;
  onSearch: (query: string) => void;
}) {
  const [q, setQ] = useState("");

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) return; // fail-closed — no blank question
    onSearch(trimmed);
  }

  return (
    <section aria-label="Ask the base" className="space-y-3">
      <form role="search" onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <label htmlFor="kb-search" className="sr-only">
          Ask the knowledge base
        </label>
        <input
          id="kb-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask the base — e.g. what is the refund window?"
          className="min-w-0 flex-1 rounded-mxm border border-mxm-border bg-mxm-bg px-3 py-2 text-sm text-mxm-content placeholder:text-mxm-content-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand"
        />
        <Button type="submit" disabled={isLoading || !q.trim()}>
          {isLoading ? "Asking…" : "Ask"}
        </Button>
      </form>

      {isLoading ? (
        <LoadingState label="Reading the base…" />
      ) : isError ? (
        <ErrorState label="Ask failed — no answer fabricated" />
      ) : hasSearched && result && !result.grounded ? (
        <p role="status" className="py-4 text-sm text-mxm-content-tertiary">
          Not covered by the base yet — add a document on this topic, or reword the question.
        </p>
      ) : hasSearched && result && result.answer ? (
        <div className="space-y-3">
          {/* The answer is the dominant element (DESIGN-STANDARD §1) — grounded + source-cited. */}
          <div className="rounded-mxm border border-mxm-border px-4 py-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-mxm-content">{result.answer}</p>
            {result.sources.length > 0 && (
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-mxm-content-tertiary">
                <span>Sources:</span>
                {result.sources.map((s) => (
                  <span
                    key={s.filename}
                    className="rounded border border-mxm-border px-1.5 text-mxm-content-secondary"
                  >
                    {s.filename}
                    {s.docType ? ` · ${s.docType}` : ""}
                  </span>
                ))}
              </p>
            )}
          </div>
          {/* The "why" — the passages the answer is grounded in, one expand away (cite, don't assert). */}
          {result.hits.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-xs text-mxm-content-tertiary">
                Show the {result.hits.length} passage{result.hits.length > 1 ? "s" : ""} behind this answer
              </summary>
              <ul aria-label="Supporting passages" className="mt-2 space-y-2">
                {result.hits.map((h) => (
                  <li key={h.chunkId} className="rounded-mxm border border-mxm-border px-3 py-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span className="font-medium text-mxm-content">{h.filename}</span>
                      {h.docType && (
                        <span className="rounded border border-mxm-border px-1.5 text-mxm-content-secondary">
                          {h.docType}
                        </span>
                      )}
                      <span
                        className="text-mxm-content-tertiary"
                        title={`cosine similarity ${(h.similarity * 100).toFixed(0)}%`}
                      >
                        {matchLabel(h.similarity)} match · {(h.similarity * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="mt-1.5 break-words text-sm text-mxm-content-secondary">{h.content}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ) : null}
    </section>
  );
}
