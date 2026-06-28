import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { AutonomyControls } from "@/features/cockpit/AutonomyControls";
import { computeNeedsYou } from "./needsYou";

const linkCls =
  "inline-flex min-h-[24px] shrink-0 items-center rounded-mxm px-2 text-sm text-mxm-content-secondary hover:text-mxm-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mxm-brand";

// "Needs you" — the top-of-screen triage of what awaits the operator NOW. Aggregates EXISTING reads only
// (cockpit.list needs_human + learningCases awaiting OK; see computeNeedsYou) and READS THROUGH to the
// surfaces that already own those flows — the Cockpit (release/pause) and the learning review queue
// (AutonomyControls). It never rebuilds a sign-off or approve flow (§8). When nothing pends it states the
// honest calm fact instead of an empty card. Color is never the sole carrier (icon + text label).
export function NeedsYouBar({ ready }: { ready: boolean }) {
  const cockpit = trpc.cockpit.list.useQuery(undefined, { enabled: ready });
  const cases = trpc.observatory.learningCases.useQuery({}, { enabled: ready });
  const [reviewOpen, setReviewOpen] = useState(false);

  // Both inputs settle fast; until then the page's global loading state covers the screen — render nothing
  // rather than flash a premature "all quiet".
  if (!ready || cockpit.isLoading || cases.isLoading) return null;

  // Fail-closed (§7): a failed/errored read leaves data undefined, which would otherwise compute total=0 and
  // render a FALSE "all quiet" while money sign-offs or lessons sit hidden. Show an honest unknown state.
  if (cockpit.isError || cases.isError) {
    return (
      <p
        role="alert"
        className="mt-4 flex items-center gap-2 rounded-mxm border border-mxm-amber bg-mxm-bg-elevated px-4 py-2.5 text-sm text-mxm-content-secondary"
      >
        <span aria-hidden="true" className="text-mxm-amber">
          ⚠
        </span>
        Couldn&apos;t check what needs you — a read failed. Refresh to try again.
      </p>
    );
  }

  const n = computeNeedsYou(cockpit.data, cases.data);

  if (n.total === 0) {
    return (
      <p
        role="status"
        className="mt-4 flex items-center gap-2 rounded-mxm border border-mxm-border px-4 py-2.5 text-sm text-mxm-content-secondary"
      >
        <span aria-hidden="true" className="text-mxm-green">
          ✓
        </span>
        All quiet — nothing needs you right now.
      </p>
    );
  }

  return (
    <section className="mt-4 rounded-mxm border border-mxm-amber bg-mxm-bg-elevated p-4" aria-label="Needs you">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-mxm-content">
        <span aria-hidden="true" className="text-mxm-amber">
          ⚠
        </span>
        Needs you
        <span className="rounded-full bg-mxm-bg-secondary px-2 py-0.5 text-xs font-normal tabular-nums text-mxm-content-secondary">
          {n.total}
        </span>
      </h2>
      <ul className="mt-2 space-y-1.5">
        {n.signOff > 0 && (
          <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="text-sm text-mxm-content-secondary">
              <span className="font-medium text-mxm-content">{n.signOff}</span> awaiting your sign-off
              {n.money > 0 ? <span className="text-mxm-amber"> · {n.money} involve money</span> : null}
            </span>
            <Link href="/cockpit" className={linkCls}>
              Review on Cockpit →
            </Link>
          </li>
        )}
        {n.lessons > 0 && (
          <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="text-sm text-mxm-content-secondary">
              <span className="font-medium text-mxm-content">{n.lessons}</span>{" "}
              {n.lessons === 1 ? "lesson" : "lessons"} awaiting your OK
            </span>
            <button type="button" onClick={() => setReviewOpen(true)} className={linkCls}>
              Review →
            </button>
          </li>
        )}
      </ul>
      <AutonomyControls open={reviewOpen} onClose={() => setReviewOpen(false)} />
    </section>
  );
}
