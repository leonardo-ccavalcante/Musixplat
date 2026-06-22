// Honest eval status: color + icon + text (WCAG, never color-only). A green cell is a real PASS only
// when the producer measured it (provenance [V]); today's floor is [I] ⇒ "inferred floor (not yet
// measured)". null status ⇒ not yet evaluated. NEVER renders the word "measured" for an [I] floor
// (§14 UI face — a typed/seeded grade must not read as a measured result).
export function EvalStatusBadge({ status, prov }: { status: "red" | "green" | null; prov?: string }) {
  if (status === null) {
    return (
      <span className="text-xs text-mxm-content-tertiary" title="No verdict produced yet">
        ○ not yet evaluated
      </span>
    );
  }
  if (status === "green" && prov === "[V]") {
    return (
      <span className="text-xs text-mxm-green" title="Measured pass — the golden set ran ([V])">
        ✓ measured pass
      </span>
    );
  }
  if (status === "green") {
    return (
      <span className="text-xs text-mxm-amber" title="Inferred conservative floor, not a measured pass ([I])">
        ◐ inferred floor
      </span>
    );
  }
  return (
    <span className="text-xs text-mxm-red" title="Did not pass">
      ✕ red
    </span>
  );
}
