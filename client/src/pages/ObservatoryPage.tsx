import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { LoadingState, ErrorState } from "@/components/ui/EmptyState";
import { FreedomTier } from "@/features/observatory/FreedomTier";
import { EvalCoachPanel } from "@/features/observatory/EvalCoachPanel";
import { LearningTier } from "@/features/observatory/LearningTier";
import { ActivityTier } from "@/features/observatory/ActivityTier";
import type { ExpandCmd } from "@/features/observatory/useExpandGroup";

// Observatory — read-only awareness of what the AI does on its own. Awareness screen: the signal
// (Posture) is the hero; actions are quiet/guarded and reuse the existing cockpit/motor surfaces. Every
// number is read from a producer (§14); nothing is computed here. dev-login mints the POOL-001 operator
// (the SAME pool as Cohorts/Cockpit, so the cohort/eval/motor data produced there shows here); tenant is
// resolved server-side.
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-mxm border border-mxm-border p-4">
      <div className="text-xs text-mxm-content-secondary">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-mxm-content">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-mxm-content-tertiary">{sub}</div> : null}
    </div>
  );
}

export function ObservatoryPage() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function login(attempt = 0): Promise<void> {
      try {
        const r = await fetch("/auth/dev-login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ user_id: "U-OP-001" }),
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

  const week = trpc.cockpit.weekSummary.useQuery(undefined, { enabled: ready });
  const cost = trpc.cost.summary.useQuery(undefined, { enabled: ready });

  // Expand all / Collapse all broadcasts to every detail tier. The nonce makes repeated clicks of the same
  // action re-fire (re-open rows a human had collapsed). null = no broadcast yet (rows start collapsed).
  const [expandCmd, setExpandCmd] = useState<ExpandCmd | null>(null);
  const nonce = useRef(0);
  const broadcast = (open: boolean) => setExpandCmd({ open, n: (nonce.current += 1) });

  return (
    <main className="mx-auto max-w-screen-xl p-[clamp(1rem,2vw,2rem)]">
      <header className="mb-6">
        <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-tight text-mxm-content">Observatory</h1>
        <p className="mt-1.5 max-w-[64ch] text-sm leading-relaxed text-mxm-content-secondary">
          What the AI is doing on its own — what it acted on, what it learned, how far it may go, and the cost.
          Read-only; every number is measured by a producer, never invented.
        </p>
      </header>

      {/* The golden-set coach is self-contained — its own modal + on-click eval mutations, no dependency on
          weekSummary — so it renders as soon as the session is ready, even while activity loads or errors.
          It used to live INSIDE the week-data branch, so a pool with no cockpit activity hid the only in-app
          path to raise the AI above the LOW floor. */}
      {ready && <EvalCoachPanel />}

      {!ready || week.isLoading ? (
        <LoadingState label={!ready ? "Signing in…" : "Reading activity…"} />
      ) : week.isError || !week.data ? (
        <ErrorState />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="AI posture this week">
            <Stat label="Acted alone (7d)" value={String(week.data.auto_acted)} />
            <Stat label="Released by you" value={String(week.data.released)} />
            <Stat label="Paused by you" value={String(week.data.paused)} />
            <Stat
              label="Token cost (total)"
              value={cost.data && cost.data.total.costUsd !== null ? `$${cost.data.total.costUsd.toFixed(2)}` : "—"}
              sub="details on /cost"
            />
          </section>

          <div className="mt-8 mb-3 flex items-center justify-end gap-1" role="group" aria-label="Expand or collapse all detail">
            <button
              type="button"
              onClick={() => broadcast(true)}
              className="inline-flex min-h-[24px] items-center rounded-mxm px-2 text-sm text-mxm-content-secondary hover:text-mxm-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mxm-brand"
            >
              Expand all
            </button>
            <span className="text-mxm-content-tertiary" aria-hidden="true">
              ·
            </span>
            <button
              type="button"
              onClick={() => broadcast(false)}
              className="inline-flex min-h-[24px] items-center rounded-mxm px-2 text-sm text-mxm-content-secondary hover:text-mxm-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mxm-brand"
            >
              Collapse all
            </button>
          </div>

          <div className="[&>section:first-child]:mt-0">
            <FreedomTier ready={ready} cmd={expandCmd} />
            <LearningTier ready={ready} cmd={expandCmd} />
            <ActivityTier ready={ready} cmd={expandCmd} />
          </div>
        </>
      )}
    </main>
  );
}
