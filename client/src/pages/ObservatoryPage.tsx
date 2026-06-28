import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { LoadingState } from "@/components/ui/EmptyState";
import { EvalCoachPanel } from "@/features/observatory/EvalCoachPanel";
import { NeedsYouBar } from "@/features/observatory/NeedsYouBar";
import { ActivityTier } from "@/features/observatory/ActivityTier";
import { LearningTier } from "@/features/observatory/LearningTier";
import { LimitsTier } from "@/features/observatory/LimitsTier";
import { type ExpandCmd, useExpandGroup } from "@/features/observatory/useExpandGroup";

// Observatory — read-only awareness of what the AI does on its own, redesigned to read calm: the eval-coach
// HERO (the one path that raises autonomy LOW→MEDIUM) leads; "Needs you" triages what awaits the operator
// NOW; the rest collapses to one-line summaries you open on demand. Every number is read from a producer
// (§14); nothing is computed here. dev-login mints the POOL-001 operator (same pool as Cohorts/Cockpit);
// tenant is resolved server-side.
const TIER_KEYS = ["activity", "learning", "limits"] as const; // stable identity ⇒ safe for useExpandGroup

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

  // Page-level Expand all / Collapse all drives the three tier sections. The nonce makes repeated clicks of
  // the same action re-fire (re-open a tier a human had collapsed). Tiers start collapsed (calm default).
  const [expandCmd, setExpandCmd] = useState<ExpandCmd | null>(null);
  const nonce = useRef(0);
  const broadcast = (open: boolean) => setExpandCmd({ open, n: (nonce.current += 1) });
  const { isOpen, setOpen } = useExpandGroup(expandCmd, TIER_KEYS as unknown as string[]);

  const costValue = cost.data && cost.data.total.costUsd !== null ? `$${cost.data.total.costUsd.toFixed(2)}` : "—";

  return (
    <main className="mx-auto max-w-screen-xl p-[clamp(1rem,2vw,2rem)]">
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-tight text-mxm-content">Observatory</h1>
          <span className="flex items-center gap-1.5 text-xs text-mxm-content-tertiary">
            <span aria-hidden="true" className="inline-block h-[7px] w-[7px] rounded-full bg-mxm-green" />
            live · last 7 days
          </span>
        </div>
        <span className="text-xs text-mxm-content-tertiary">acting within your limits</span>
      </header>
      <p className="mb-1 max-w-[64ch] text-sm leading-relaxed text-mxm-content-secondary">
        What the AI is doing on its own — read-only; every number is measured by a producer, never invented.
      </p>

      {/* HERO: the eval-coach is self-contained (its own modal + mutations) — renders as soon as the session
          is ready, even while activity loads, so the only in-app path above the LOW floor is always present. */}
      {ready && <EvalCoachPanel />}
      {ready && <NeedsYouBar ready={ready} />}

      {!ready ? (
        <LoadingState label="Signing in…" />
      ) : (
        <>
          <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="AI posture this week">
            <Stat label="Acted alone (7d)" value={week.data ? String(week.data.auto_acted) : "—"} />
            <Stat label="Released by you" value={week.data ? String(week.data.released) : "—"} />
            <Stat label="Paused by you" value={week.data ? String(week.data.paused) : "—"} />
            <Stat label="Token cost (total)" value={costValue} sub="details on /cost" />
          </section>

          <div className="mt-8 mb-1 flex items-center justify-between gap-2 border-t border-mxm-border pt-3">
            <span className="text-xs text-mxm-content-tertiary">Detail — open only what you need</span>
            <div className="flex items-center gap-1" role="group" aria-label="Expand or collapse all detail">
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
          </div>

          <div>
            <ActivityTier open={isOpen("activity")} onOpenChange={(o) => setOpen("activity", o)} />
            <LearningTier open={isOpen("learning")} onOpenChange={(o) => setOpen("learning", o)} />
            <LimitsTier open={isOpen("limits")} onOpenChange={(o) => setOpen("limits", o)} />
          </div>
        </>
      )}
    </main>
  );
}
