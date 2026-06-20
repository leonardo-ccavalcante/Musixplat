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
export function CockpitHero({ counts, onOpenCatalog }: { counts: FleetCounts; onOpenCatalog: () => void }) {
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
      </div>

      {/* The "depois": the AI's track record is honest — every release is traced; browse per-action results.
          (Fleet week-counts are a thin Decision_Trace read, flagged as a follow-up — not fabricated here.) */}
      <div className="flex flex-col justify-between gap-4 rounded-mxm border border-mxm-border bg-mxm-bg-elevated p-[clamp(1.1rem,2.2vw,1.4rem)]">
        <div>
          <p className="text-[0.7rem] uppercase tracking-wide text-mxm-content-tertiary">The proof</p>
          <p className="mt-1.5 text-sm leading-relaxed text-mxm-content-secondary">
            Every action the AI takes is traced. See how each best-action has performed across the company before you trust it with more autonomy.
          </p>
        </div>
        <Button variant="ghost" onClick={onOpenCatalog} aria-haspopup="dialog" className="self-start text-mxm-brand">
          What are these actions? →
        </Button>
      </div>
    </section>
  );
}
