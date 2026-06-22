// Honest eval status: color + icon + text (WCAG, never color-only). A green cell is a real PASS only
// when the producer measured it (provenance [V]); today's floor is [I] ⇒ "inferred floor (not yet
// measured)". null status ⇒ not yet evaluated. A non-null status with NO provenance is NOT asserted as a
// verdict (§3.10). NEVER renders the word "measured" for an [I] floor (§14 UI face).
export function EvalStatusBadge({ status, prov }: { status: "red" | "green" | null; prov?: string }) {
  if (status === null) {
    return (
      <span className="text-xs text-mxm-content-tertiary" title="No verdict produced yet">
        ○ not yet evaluated
      </span>
    );
  }
  if (!prov) {
    // §3.10 — a result with no provenance is not rendered/asserted as a verdict.
    return (
      <span className="text-xs text-mxm-content-tertiary" title="No provenance — not shown as a verdict">
        ○ no provenance
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
