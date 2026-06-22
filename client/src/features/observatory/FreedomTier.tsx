import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { CapEditModal } from "./CapEditModal";
import { EvalStatusBadge } from "./EvalStatusBadge";

// §14 honest-pending + §3.10 provenance gate: NULL → "not measured"; a non-null result with no
// provenance tag is not asserted ("no provenance"); otherwise the value.
const cell = (v: number | boolean | null, prov?: string): string =>
  v === null ? "not measured" : !prov ? "no provenance" : typeof v === "boolean" ? (v ? "yes" : "no") : String(v);

// Freedom = how far the AI may go. The eval grid is READ-ONLY (the grade is producer-measured; a human
// cannot type it — §14). Full traceability lives in each row's expand. The honest human lever is the CAP,
// edited via the EXISTING cockpit config template/upload (CapEditModal → managerProcedure, [V]).
export function FreedomTier({ ready }: { ready: boolean }) {
  const evals = trpc.observatory.evalList.useQuery(undefined, { enabled: ready });
  const [capOpen, setCapOpen] = useState(false);

  return (
    <section className="mt-8" aria-label="How far the AI may go">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-mxm-content">Freedom — how far the AI may go</h2>
        <Button variant="ghost" onClick={() => setCapOpen(true)}>
          Edit limits…
        </Button>
      </div>
      <p className="mb-3 max-w-[68ch] text-xs text-mxm-content-secondary">
        The AI&apos;s autonomy grade per cohort &amp; intent. Today these are a conservative floor the system
        has not yet measured — green counts as a real pass only once measured. Expand a row for the full
        evidence; tighten the ceiling any time (a human decision, never a faked measurement).
      </p>

      {!ready || evals.isLoading ? (
        <div className="h-24 animate-pulse rounded-mxm border border-mxm-border" />
      ) : evals.isError ? (
        <p className="text-sm text-mxm-red">Couldn&apos;t read evals — try again.</p>
      ) : (evals.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-mxm-content-secondary">No eval cells yet for this pool.</p>
      ) : (
        <ul className="space-y-2">
          {evals.data!.map((e) => {
            const lvlProv = e.provenanceByField?.released_evals;
            return (
              <li key={`${e.cohortId}-${e.intent}-${e.version}`} className="rounded-mxm border border-mxm-border p-3">
                <details>
                  <summary className="flex cursor-pointer items-center justify-between gap-3">
                    <span className="text-mxm-content">
                      {e.cohortId} <span className="text-mxm-content-secondary">· {e.intent}</span>
                    </span>
                    <span className="flex items-center gap-3 text-xs">
                      <span className="text-mxm-content" title={lvlProv ? `provenance ${lvlProv}` : "no provenance"}>
                        {e.releasedEvals === null ? "not yet measured" : lvlProv ? e.releasedEvals : "—"}
                      </span>
                      <EvalStatusBadge status={e.status} prov={e.provenanceByField?.status} />
                    </span>
                  </summary>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <Field k="Sample (n)" v={cell(e.nCohortXIntent, e.provenanceByField?.n_cohort_x_intent)} />
                    <Field k="Agreement (kappa)" v={cell(e.kappa, e.provenanceByField?.kappa)} />
                    <Field k="Red-team independent" v={cell(e.redteamIndependenceFlag, e.provenanceByField?.redteam_independence_flag)} />
                    <Field
                      k="Red-team result"
                      v={
                        e.redteamJudgeVsHumanResult === null
                          ? "not measured"
                          : e.provenanceByField?.redteam_judge_vs_human_result
                            ? e.redteamJudgeVsHumanResult
                            : "no provenance"
                      }
                    />
                    <Field k="Golden-set version" v={e.version} />
                  </dl>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      <CapEditModal
        open={capOpen}
        onClose={() => {
          setCapOpen(false);
          void evals.refetch();
        }}
      />
    </section>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-mxm-content-tertiary">{k}</dt>
      <dd className="tabular-nums text-mxm-content-secondary">{v}</dd>
    </div>
  );
}
