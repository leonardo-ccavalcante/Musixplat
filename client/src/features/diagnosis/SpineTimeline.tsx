import { cn } from "@/lib/utils";

// The operable spine, made legible: Inbound → Diagnosis → Silent → Impact → Dossier → Artifact →
// Human gate → 1:10. Each node shows a PRODUCED number + state; the UI computes no business number,
// it only reflects what the producers wrote. State is carried redundantly (text + style), never colour-only.
export interface SpineNode {
  key: string;
  label: string;
  value: string;
  done: boolean;
}

export function SpineTimeline({ nodes }: { nodes: SpineNode[] }) {
  return (
    <nav aria-label="Spine timeline" className="mb-6 flex flex-wrap items-center gap-2">
      {nodes.map((n, i) => (
        <div key={n.key} className="flex items-center gap-2">
          <div
            className={cn(
              "min-w-[7.5rem] rounded-mxm border px-3 py-2",
              n.done ? "border-mxm-brand bg-mxm-bg-elevated" : "border-mxm-border",
            )}
          >
            <div className="text-xs font-medium text-mxm-content">{n.label}</div>
            <div className="text-sm tabular-nums text-mxm-content-secondary">{n.value}</div>
            <span className="sr-only">{n.done ? "complete" : "pending"}</span>
          </div>
          {i < nodes.length - 1 && (
            <span aria-hidden className="text-mxm-content-tertiary">
              →
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}
