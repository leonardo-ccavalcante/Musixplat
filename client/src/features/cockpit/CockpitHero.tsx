import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

export interface FleetCounts {
  total: number;
  cohorts: number;
  autos: number;
  money: number;
  level: number;
  gate: number;
}

// One legend / bar entry — color + icon + label, never color-only (WCAG 2.1 AA, DESIGN-STANDARD §5).
const SEGS = [
  { key: "autos", label: "AUTO — AI acts alone", icon: "●", bar: "bg-mxm-green", text: "text-mxm-green" },
  { key: "money", label: "Money — only proposes", icon: "▲", bar: "bg-mxm-red", text: "text-mxm-red" },
  { key: "level", label: "Escalated level", icon: "▲", bar: "bg-mxm-amber", text: "text-mxm-amber" },
  { key: "gate", label: "Gate held", icon: "◼", bar: "bg-mxm-content-tertiary", text: "text-mxm-content-tertiary" },
] as const;

// 02:EPIC-1 — the HERO of the cockpit (an awareness screen): the fleet's autonomy posture in one look.
// The signal is the hero, not a CTA — every count here is derived from the produced proposal rows (§14),
// never fabricated. "Today's proposals" answers the agent-manager's question: where is the AI acting alone,
// and exactly where must I step in?
export interface RunResult {
  proposed: number;
  auto_acted: number;
  escalated: number;
  cohorts: number;
}

// 02C:6a — the result of running the MOTOR (the LLM autonomous engine, distinct from "Run NBA"): how many
// cohorts it walked, where it acted alone within range, and where it escalated back to a human (§14, read).
export interface MotorRunResult {
  acted: number;
  escalated: number;
  attempts: number;
  cohorts: number;
}

export function CockpitHero({
  counts,
  week,
  onOpenCatalog,
  onOpenRegistry,
  onRunNba,
  running,
  runResult,
  onRunMotor,
  motorRunning,
  motorResult,
  onOpenEscalations,
}: {
  counts: FleetCounts;
  week?: { released: number; paused: number; auto_acted: number };
  onOpenCatalog: () => void;
  onOpenRegistry: () => void;
  onRunNba: () => void;
  running: boolean;
  runResult?: RunResult | null;
  onRunMotor: () => void;
  motorRunning: boolean;
  motorResult?: MotorRunResult | null;
  onOpenEscalations: () => void;
}) {
  const { total, cohorts, autos, money, level, gate } = counts;
  const needs = money + level + gate;
  const pct = (n: number) => (total > 0 ? `${(n / total) * 100}%` : "0%");
  const vals: Record<string, number> = { autos, money, level, gate };

  return (
    <section className="grid gap-[clamp(1rem,2vw,1.5rem)] md:grid-cols-[1.15fr_0.85fr]" aria-label="Fleet autonomy posture">
      <div className="rounded-mxm border border-mxm-border bg-mxm-bg-elevated p-[clamp(1.1rem,2.2vw,1.6rem)]">
        <p className="text-[0.7rem] uppercase tracking-wide text-mxm-content-tertiary">Today&apos;s proposals</p>
        <p className="mt-1 max-w-[48ch] text-base leading-relaxed text-mxm-content-secondary">
          The AI proposed <b className="font-semibold text-mxm-content tabnum">{total}</b> best-actions across{" "}
          <b className="font-semibold text-mxm-content tabnum">{cohorts}</b> cohort{cohorts === 1 ? "" : "s"}. It&apos;s clear to act{" "}
          <b className="font-semibold text-mxm-green tabnum">alone on {autos}</b>.{" "}
          {needs > 0 ? (
            <>
              <b className="font-semibold text-mxm-brand tabnum">{needs} need your call</b> — {money} touch money, {level} escalated beyond low autonomy, {gate} held by a gate.
            </>
          ) : (
            <b className="font-semibold text-mxm-content">Nothing needs you right now — the AI has it.</b>
          )}
        </p>

        {total > 0 && (
          <div className="mt-5 flex h-3.5 overflow-hidden rounded-full bg-mxm-bg-secondary" role="img" aria-label={`${autos} auto-handled, ${money} money, ${level} escalated, ${gate} gated`}>
            {SEGS.map((s) => (vals[s.key]! > 0 ? <span key={s.key} className={cn("block h-full", s.bar)} style={{ width: pct(vals[s.key]!) }} /> : null))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
          {SEGS.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-xs text-mxm-content-secondary">
              <span aria-hidden className={cn("text-[0.7rem]", s.text)}>{s.icon}</span>
              {s.label} <b className="font-semibold text-mxm-content tabnum">{vals[s.key]}</b>
            </span>
          ))}
        </div>

        {/* 02:CP2 — run the engine: it proposes + the AI acts ALONE on the safe, non-money ones (money always
            waits for you). The spectrum is produced live (§14), then surfaced as plain language. */}
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-mxm-border pt-4">
          <Button onClick={onRunNba} disabled={running} aria-busy={running}>
            {running ? "Running the engine…" : "Run NBA"}
          </Button>
          <span aria-live="polite" className="text-xs text-mxm-content-secondary">
            {runResult ? (
              runResult.proposed === 0 ? (
                "No new actions this run — nothing met the bar."
              ) : (
                <>
                  Proposed <b className="tabnum text-mxm-content">{runResult.proposed}</b> across{" "}
                  <b className="tabnum text-mxm-content">{runResult.cohorts}</b> cohort
                  {runResult.cohorts === 1 ? "" : "s"} ·{" "}
                  <b className="tabnum text-mxm-green">AI acted on {runResult.auto_acted}</b> ·{" "}
                  <b className="tabnum text-mxm-brand">{runResult.escalated} sent to you</b>.
                </>
              )
            ) : (
              "The engine diagnoses each cohort, proposes a best-action, and acts alone where it's safe."
            )}
          </span>
        </div>

        {/* 02C:6a — run the MOTOR: the LLM autonomous engine (≤3 hypothesis loop). It reasons over each
            cohort's problem restaurants, acts ALONE inside the range you approved, and escalates the rest to
            you. The OpenAI call is slow — the button stays busy until it's truly done (never a fake-instant
            success). Counts are read from what the loop produced (§14). */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="ghost" onClick={onRunMotor} disabled={motorRunning} aria-busy={motorRunning} className="text-mxm-brand">
            {motorRunning ? "Motor reasoning…" : "Run Motor"}
          </Button>
          <span aria-live="polite" className="text-xs text-mxm-content-secondary">
            {motorRunning ? (
              "The motor is reasoning through each cohort — this calls the LLM, so it takes a moment."
            ) : motorResult ? (
              motorResult.attempts === 0 ? (
                "No in-range gaps this run — the motor found nothing to act on."
              ) : (
                <>
                  <b className="tabnum text-mxm-green">AI acted alone on {motorResult.acted}</b> ·{" "}
                  <b className="tabnum text-mxm-amber">escalated {motorResult.escalated} to you</b>{" "}
                  across <b className="tabnum text-mxm-content">{motorResult.cohorts}</b> cohort
                  {motorResult.cohorts === 1 ? "" : "s"}.
                </>
              )
            ) : (
              "The autonomous engine reasons over each cohort and acts alone within your approved range."
            )}
          </span>
        </div>
      </div>

      {/* The "depois": every decision is traced — last 7 days (read from Release_Batch ⋈ Decision_Trace, §14,
          never fabricated). The AI acting alone now leaves an honest origin='auto' trace, so "acted alone" is
          a real count (opens the registry), no longer omitted. */}
      <div className="flex flex-col justify-between gap-4 rounded-mxm border border-mxm-border bg-mxm-bg-elevated p-[clamp(1.1rem,2.2vw,1.4rem)]">
        <div>
          <p className="text-[0.7rem] uppercase tracking-wide text-mxm-content-tertiary">
            Your week so far <span className="normal-case tracking-normal text-mxm-content-tertiary">· from the trace log</span>
          </p>
          <div className="mt-2 grid grid-cols-3 gap-3">
            <div>
              <div className="text-2xl font-semibold tabnum text-mxm-content">{week ? week.released : "—"}</div>
              <div className="mt-0.5 text-xs text-mxm-content-secondary">you released</div>
            </div>
            <div>
              <div className="text-2xl font-semibold tabnum text-mxm-content">{week ? week.paused : "—"}</div>
              <div className="mt-0.5 text-xs text-mxm-content-secondary">you paused</div>
            </div>
            <button
              type="button"
              onClick={onOpenRegistry}
              aria-haspopup="dialog"
              className="rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand"
            >
              <div className="text-2xl font-semibold tabnum text-mxm-green">{week ? week.auto_acted : "—"}</div>
              <div className="mt-0.5 text-xs text-mxm-green underline-offset-2 hover:underline">AI acted alone →</div>
            </button>
          </div>
          <p className="mt-2 text-xs text-mxm-content-tertiary">
            Every release, pause, and autonomous action is recorded as a decision trace.
          </p>
          {/* 02C:6a — the motor's hand-backs: cases it couldn't resolve in-range and escalated to a human.
              The amber ▲ (icon + text, not color alone) signals "needs you", opens the full reasoning trail. */}
          <button
            type="button"
            onClick={onOpenEscalations}
            aria-haspopup="dialog"
            className="mt-3 flex w-full items-center gap-1.5 rounded border-t border-mxm-border pt-3 text-left text-xs text-mxm-amber underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand"
          >
            <span aria-hidden>▲</span> The motor escalated cases to you — review what it tried →
          </button>
        </div>
        <Button variant="ghost" onClick={onOpenCatalog} aria-haspopup="dialog" className="self-start text-mxm-brand">
          What are these actions? →
        </Button>
      </div>
    </section>
  );
}
