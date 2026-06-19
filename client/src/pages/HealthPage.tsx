import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { LoadingState, ErrorState } from "@/components/ui/EmptyState";

// 05DE — Health (1:10). Read-only VITRINA: it only READS numbers their producers wrote (BR-DE1); the
// ratio is DERIVED by gov.fn_roi_1_10, never here. No-signal/provisional shown honestly — never green-fake
// (BR-DE9). dev-login mints the POOL-PAY operator; tenant resolved server-side.
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-mxm border border-mxm-border p-4">
      <div className="text-xs text-mxm-content-secondary">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-mxm-content">{value}</div>
    </div>
  );
}

export function HealthPage() {
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

  const q = trpc.roi.summary.useQuery(undefined, { enabled: ready });
  const h = q.data;

  return (
    <main className="mx-auto max-w-screen-xl p-[clamp(1rem,2vw,2rem)]">
      <header className="mb-6">
        <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-tight text-mxm-content">Health · 1:10</h1>
        <p className="mt-1.5 max-w-[64ch] text-sm leading-relaxed text-mxm-content-secondary">
          Operator leverage, DERIVED from real counters — units the AI processed per unit of human touch.
          The number appears only once a human touches; it is provisional, not confirmed business impact.
        </p>
      </header>

      {!ready || q.isLoading ? (
        <LoadingState label={!ready ? "Signing in…" : "Reading health…"} />
      ) : q.isError || !h ? (
        <ErrorState />
      ) : (
        <>
          <div
            aria-live="polite"
            className="mb-6 rounded-mxm border border-mxm-brand bg-mxm-bg-elevated p-5"
          >
            <div className="text-xs uppercase tracking-wide text-mxm-content-secondary">Operator leverage</div>
            <div className="mt-1 text-4xl font-semibold tabular-nums text-mxm-content">
              {h.ratio == null ? "no signal yet" : `${h.ratio} : 1`}
            </div>
            <div className="mt-1 text-sm text-mxm-content-secondary">
              seal: {h.seal === "no_signal" ? "no signal (no human touch yet)" : `${h.seal} (efficiency, not 2-gate confirmed)`}
              {h.freshness ? ` · fresh ${h.freshness.slice(0, 19)}` : ""}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Units processed" value={String(h.units)} />
            <Stat label="Dossiers" value={String(h.dossiers)} />
            <Stat label="Artifacts" value={String(h.artifacts)} />
            <Stat label="Human reviews" value={String(h.reviews)} />
            <Stat label="Escalations" value={String(h.escalations)} />
            <Stat label="Human minutes" value={`${h.humanMinutes} (${h.ahtMinutes}/touch)`} />
          </div>
        </>
      )}
    </main>
  );
}
