// Freshness / staleness (BR-12 / EC-9 / EC-12). `stale` is computed SERVER-side by fn_is_stale
// (TTL_baseline_days knob BY NAME) — the client never hardcodes the TTL. Fail-closed: unknown
// staleness ⇒ treated as stale (degrade to qualitative/link, never trust an unknown-fresh value).
// Color is never the sole carrier: the "⚠ stale" / "fresh" word + a title carry the meaning.
export function FreshnessBadge({
  freshness,
  stale,
  className,
}: {
  freshness?: string | null;
  stale?: boolean | null;
  className?: string;
}) {
  const isStale = stale ?? true; // fail-closed: null/undefined ⇒ stale
  const date = freshness ? freshness.slice(0, 10) : "no date";
  return (
    <span
      className={`text-[10px] ${isStale ? "text-mxm-amber" : "text-mxm-content-tertiary"} ${className ?? ""}`}
      title={isStale ? "Stale (past TTL) — degrade to qualitative/link" : "Fresh (within TTL)"}
      role={isStale ? "status" : undefined}
    >
      <span aria-hidden="true">{isStale ? "⚠ " : ""}</span>
      {isStale ? "stale" : "fresh"} · <span className="tabnum">{date}</span>
    </span>
  );
}
