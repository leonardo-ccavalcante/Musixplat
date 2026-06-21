import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { LoadingState, ErrorState } from "@/components/ui/EmptyState";
import { formatUsd, formatTokens } from "@/lib/cost";

// P07 — AI Cost. Read-only VITRINA over gov.v_llm_cost: it only READS produced numbers (§3.6), never
// computes a cost here. Unpriced models show "—" + an honest banner, never a fake $0 (§3.7). dev-login
// mints the POOL-PAY operator; tenant resolved server-side.

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-mxm border border-mxm-border p-4">
      <div className="text-xs text-mxm-content-secondary">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-mxm-content">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-mxm-content-tertiary tabular-nums">{sub}</div> : null}
    </div>
  );
}

const PROCESS_LABEL: Record<string, string> = {
  diagnosis: "Diagnosis (ticket)",
  kb_ask: "Knowledge Q&A",
  kb_search: "Knowledge search",
  kb_ingest: "Knowledge ingest",
  nba_kb_check: "NBA policy check",
};

export function CostPage() {
  const [ready, setReady] = useState(false);
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

  const q = trpc.cost.summary.useQuery(undefined, { enabled: ready });
  const d = q.data;

  return (
    <main className="mx-auto max-w-screen-xl p-[clamp(1rem,2vw,2rem)]">
      <header className="mb-6">
        <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-tight text-mxm-content">AI Cost</h1>
        <p className="mt-1.5 max-w-[64ch] text-sm leading-relaxed text-mxm-content-secondary">
          Token spend by process and by ticket — the cost of the attention the AI gave. Every number is
          measured from the provider's reported usage priced by the configured rate; a model with no
          configured price shows “—”, never a misleading $0.
        </p>
      </header>

      {!ready || q.isLoading ? (
        <LoadingState label={!ready ? "Signing in…" : "Reading cost…"} />
      ) : q.isError || !d ? (
        <ErrorState />
      ) : (
        <div className="space-y-6">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total spend" value={formatUsd(d.total.costUsd)} sub={`${d.total.calls} calls`} />
            <Stat label="Input tokens" value={formatTokens(d.total.inTok)} />
            <Stat label="Output tokens" value={formatTokens(d.total.outTok)} />
            <Stat label="LLM calls" value={String(d.total.calls)} />
          </section>

          {d.unpriced.calls > 0 ? (
            <div className="rounded-mxm border border-mxm-amber/40 p-3 text-sm text-mxm-amber">
              ⚠ {d.unpriced.calls} call{d.unpriced.calls === 1 ? " has" : "s have"} no configured price
              {d.unpriced.models.length ? ` (model${d.unpriced.models.length === 1 ? "" : "s"}: ${d.unpriced.models.join(", ")})` : ""}
              {" "}— their cost is excluded from totals until a price knob is set.
            </div>
          ) : null}

          <section>
            <h2 className="mb-2 text-sm font-medium text-mxm-content">Cost by process</h2>
            {d.byProcess.length === 0 ? (
              <p className="text-sm text-mxm-content-secondary">No AI calls recorded yet.</p>
            ) : (
              <div className="overflow-hidden rounded-mxm border border-mxm-border">
                <table className="w-full text-sm">
                  <thead className="bg-mxm-bg-secondary text-left text-xs text-mxm-content-secondary">
                    <tr>
                      <th className="px-3 py-2 font-medium">Process</th>
                      <th className="px-3 py-2 text-right font-medium">Cost</th>
                      <th className="px-3 py-2 text-right font-medium">Calls</th>
                      <th className="px-3 py-2 text-right font-medium">In</th>
                      <th className="px-3 py-2 text-right font-medium">Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.byProcess.map((p) => (
                      <tr key={p.processType} className="border-t border-mxm-border">
                        <td className="px-3 py-2 text-mxm-content">{PROCESS_LABEL[p.processType] ?? p.processType}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-mxm-content">{formatUsd(p.costUsd)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-mxm-content-secondary">{p.calls}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-mxm-content-secondary">{formatTokens(p.inTok)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-mxm-content-secondary">{formatTokens(p.outTok)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium text-mxm-content">Top tickets by cost</h2>
            {d.byTicket.length === 0 ? (
              <p className="text-sm text-mxm-content-secondary">No ticket-attributed calls yet.</p>
            ) : (
              <div className="overflow-hidden rounded-mxm border border-mxm-border">
                <table className="w-full text-sm">
                  <thead className="bg-mxm-bg-secondary text-left text-xs text-mxm-content-secondary">
                    <tr>
                      <th className="px-3 py-2 font-medium">Ticket / ref</th>
                      <th className="px-3 py-2 text-right font-medium">Cost</th>
                      <th className="px-3 py-2 text-right font-medium">Calls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.byTicket.map((t) => (
                      <tr key={t.refId} className="border-t border-mxm-border">
                        <td className="px-3 py-2 font-mono text-xs text-mxm-content">{t.refId}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-mxm-content">{formatUsd(t.costUsd)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-mxm-content-secondary">{t.calls}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
