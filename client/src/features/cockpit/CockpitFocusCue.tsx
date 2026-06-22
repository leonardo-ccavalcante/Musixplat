// 02:CP — focus cue. A persistent, readable banner (not a vanishing toast): when the handed-off cohort is on
// the board it points the eye there; when it isn't yet (rare — "Prepare cockpit" normally populates the pool)
// it says so honestly and names the producer to run (§7 fail-closed, §14 never a blank). "Show all" drops focus.
export function CockpitFocusCue({
  cohortId,
  present,
  onClear,
}: {
  cohortId: string;
  present: boolean;
  onClear: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-3 mt-[clamp(1.5rem,3vw,2.25rem)] flex flex-wrap items-center justify-between gap-2 rounded-mxm border border-mxm-brand/40 bg-mxm-brand/10 px-3 py-2 text-sm text-mxm-content"
    >
      <span>
        {present ? (
          <>
            Where your handoff landed → cohort <b className="font-semibold">{cohortId}</b>
          </>
        ) : (
          <>
            No proposal for cohort <b className="font-semibold">{cohortId}</b> yet — run Prepare cockpit / Run NBA.
          </>
        )}
      </span>
      <button
        onClick={onClear}
        className="shrink-0 text-xs text-mxm-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand"
      >
        Show all
      </button>
    </div>
  );
}
