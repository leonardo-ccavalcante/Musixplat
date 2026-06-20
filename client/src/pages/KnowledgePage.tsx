import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { ProvenanceLegend } from "@/components/ui/ProvenanceLegend";
import { UploadModal } from "@/features/knowledge/UploadModal";
import { DocList } from "@/features/knowledge/DocList";
import { SearchTester } from "@/features/knowledge/SearchTester";
import { uploadResult, type DocRow, type SearchHit, type UploadResult } from "@shared/contracts_knowledge";

// P06 — the dedicated Knowledge Base console. Upload many formats → the AI PROPOSES a type ([I]) → the
// human confirms ([V]) → it joins the base (pgvector, tenant scoped server-side, §3.4). The search
// tester is the visible proof the base holds a given shape. Every type is PROPOSED text, never a number
// (§3.6); tenant_id is resolved from the session cookie, never sent in the body. dev-login mints the
// POOL-PAY operator (mirrors DiagnosisPage so the screen is exercisable end-to-end).
export function KnowledgePage() {
  const [ready, setReady] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function login(attempt = 0): Promise<void> {
      try {
        const r = await fetch("/auth/dev-login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ user_id: "U-PAY-001" }),
        });
        if (!r.ok) throw new Error(String(r.status));
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled && attempt < 15) setTimeout(() => void login(attempt + 1), 500);
        else if (!cancelled) setReady(true);
      }
    }
    void login();
    return () => {
      cancelled = true;
    };
  }, []);

  const utils = trpc.useUtils();
  const listQ = trpc.knowledge.list.useQuery(undefined, { enabled: ready });
  const rows = useMemo(() => (listQ.data ?? []) as DocRow[], [listQ.data]);

  const upload = trpc.knowledge.upload.useMutation();
  const confirm = trpc.knowledge.confirmType.useMutation();

  // Search is run on submit (not on every keystroke) — keep the query in state and pass it to useQuery.
  const [query, setQuery] = useState("");
  const searchQ = trpc.knowledge.search.useQuery(
    { query },
    { enabled: ready && searched && query.length > 0 },
  );
  const hits = useMemo(() => (searchQ.data?.hits ?? []) as SearchHit[], [searchQ.data]);

  return (
    <main className="mx-auto max-w-screen-xl p-[clamp(1rem,2vw,2rem)]">
      <header className="mb-6">
        <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-tight text-mxm-content">
          Knowledge Base
        </h1>
        <p className="mt-1.5 max-w-[64ch] text-sm leading-relaxed text-mxm-content-secondary [hyphens:auto] [text-align:justify]">
          Upload the company's documents — policies, terms, runbooks, FAQs. The AI proposes a type; you
          confirm it. Every answer first runs the base and cites its source.
        </p>
        <p className="mt-2 text-xs text-mxm-content-tertiary">
          Honesty: the type is <span className="text-mxm-content-secondary">proposed text</span> ([I]) until
          you confirm it ([V]) — never a fabricated number. A file that cannot be parsed is flagged{" "}
          <span className="text-mxm-content-secondary">parse_failed</span>, never a silent success.
        </p>
        {ready && (
          <div className="mt-4">
            <Button type="button" onClick={() => setUploadOpen(true)}>
              Upload document
            </Button>
          </div>
        )}
      </header>

      <section aria-label="Documents" className="mb-8 space-y-3">
        <h2 className="text-sm font-semibold text-mxm-content">Documents</h2>
        <DocList rows={rows} isLoading={!ready || listQ.isLoading} isError={listQ.isError} />
        <ProvenanceLegend />
      </section>

      <section aria-label="Search" className="space-y-3">
        <h2 className="text-sm font-semibold text-mxm-content">Search tester</h2>
        <p className="max-w-[64ch] text-xs text-mxm-content-tertiary">
          Run a query against the base to see whether it holds this shape — the retrieval, in view.
        </p>
        <SearchTester
          hits={hits}
          hasSearched={searched && !!searchQ.data}
          isLoading={searched && searchQ.isFetching}
          isError={searchQ.isError}
          onSearch={(q) => {
            setQuery(q);
            setSearched(true);
          }}
        />
      </section>

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUpload={async (input): Promise<UploadResult> => {
          // The router's inferred type widens proposedType to string (its producer returns a string);
          // re-validate through the shared contract so the proposed type is a true DocType (closed list).
          return uploadResult.parse(await upload.mutateAsync(input));
        }}
        onConfirm={async (input) => {
          await confirm.mutateAsync(input);
        }}
        onDone={() => void utils.knowledge.list.invalidate()}
      />
    </main>
  );
}
