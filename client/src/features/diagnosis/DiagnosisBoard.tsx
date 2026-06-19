import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { DiagnosisRow } from "./DiagnosisRow";
import { SilentCascade } from "./SilentCascade";
import type { DiagnosisListRow } from "@shared/contracts_05b";

function Section({ title, count, accent, children }: { title: string; count: number; accent?: boolean; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-mxm border border-mxm-border bg-mxm-bg-elevated">
      <header className="flex items-center gap-2 border-b border-mxm-border px-[clamp(0.75rem,1.5vw,1.25rem)] py-3">
        <h2 className="text-lg font-semibold text-mxm-content">{title}</h2>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums",
            accent ? "border-mxm-amber text-mxm-amber" : "border-mxm-border text-mxm-content-secondary",
          )}
        >
          {count}
        </span>
      </header>
      <div className="px-[clamp(0.75rem,1.5vw,1.25rem)]">{children}</div>
    </section>
  );
}

// 05B board — leads with the reverse-cascade hero (the uau), then the human queue (degrade-to-human,
// BR-B3), then every diagnosed problem. Organised by what the operator must SEE first, not by table.
// Presentational: the page owns the dossier modal, wired through onOpen.
export function DiagnosisBoard({
  rows,
  onOpen,
  onSteps,
}: {
  rows: DiagnosisListRow[];
  onOpen: (row: DiagnosisListRow) => void;
  onSteps?: (row: DiagnosisListRow) => void;
}) {
  if (rows.length === 0) return <EmptyState>Nothing to report. All processes green.</EmptyState>;

  // headline cascade = the biggest hidden problem (most silent, then most affected).
  const headline = [...rows].sort((a, b) => b.silent - a.silent || b.affected - a.affected)[0]!;
  const needsHuman = rows.filter((r) => r.needs_human);

  return (
    <div className="grid gap-[clamp(1rem,2vw,1.5rem)]">
      <SilentCascade row={headline} onOpen={onOpen} onSteps={onSteps} />

      {needsHuman.length > 0 && (
        <Section title="Needs your decision" count={needsHuman.length} accent>
          {needsHuman.map((r) => (
            <DiagnosisRow key={r.problem_id} row={r} onOpen={onOpen} onSteps={onSteps} />
          ))}
        </Section>
      )}

      <Section title="Diagnosed" count={rows.length}>
        {rows.map((r) => (
          <DiagnosisRow key={r.problem_id} row={r} onOpen={onOpen} onSteps={onSteps} muted={r.needs_human} />
        ))}
      </Section>
    </div>
  );
}
