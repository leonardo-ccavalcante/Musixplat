import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { AutonomousRegistry } from "@/features/cockpit/AutonomousRegistry";
import { EscalatedList } from "@/features/cockpit/EscalatedList";

// Activity = what the AI did alone + its governance gates. RESULT/NULL fields (time-to-sign, gate result,
// rubber-stamp) render "not measured" (honest-pending §14), never 0. Full traceability (proposer,
// confirmer, escalation axis, gates) lives in each row's expand. Decision_Trace is append-only — read
// only here. Release/pause is operated per-NBA on the Cockpit (reuse, not a rebuilt invariant-bearing
// flow) — linked, not duplicated.
const stamp = (v: boolean | null): string => (v === null ? "not measured" : v ? "yes" : "no");

export function ActivityTier({ ready }: { ready: boolean }) {
  const traces = trpc.observatory.traces.useQuery(undefined, { enabled: ready });
  const [registryOpen, setRegistryOpen] = useState(false);
  const [escOpen, setEscOpen] = useState(false);

  return (
    <section className="mt-8" aria-label="What the AI did alone">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-mxm-content">Activity &amp; trace</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => setRegistryOpen(true)}>
            Full registry…
          </Button>
          <Button variant="ghost" onClick={() => setEscOpen(true)}>
            Escalations…
          </Button>
          <Link
            href="/cockpit"
            className="inline-flex min-h-[24px] items-center rounded-mxm px-2 text-sm text-mxm-content-secondary hover:text-mxm-content"
          >
            Release / pause on Cockpit →
          </Link>
        </div>
      </div>

      {!ready || traces.isLoading ? (
        <div className="h-24 animate-pulse rounded-mxm border border-mxm-border" />
      ) : traces.isError ? (
        <p className="text-sm text-mxm-red">Couldn&apos;t read traces — try again.</p>
      ) : (traces.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-mxm-content-secondary">No autonomous actions recorded yet.</p>
      ) : (
        <ul className="space-y-2">
          {traces.data!.map((t) => (
            <li key={t.traceId} className="rounded-mxm border border-mxm-border p-3">
              <details>
                <summary className="flex cursor-pointer items-center justify-between gap-3">
                  <span className="text-mxm-content">
                    {t.action} <span className="text-mxm-content-secondary">· {t.effectiveLevelApplied ?? "not measured"}</span>
                  </span>
                  <span className="text-xs text-mxm-content-tertiary tabular-nums">{t.ts.slice(0, 10)}</span>
                </summary>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <Field k="Proposer" v={t.proposerId} />
                  <Field k="Confirmer" v={t.confirmerId ?? "auto (none)"} />
                  <Field k="Independent" v={t.independenceGuaranteed === null ? "not measured" : t.independenceGuaranteed ? "yes" : "no"} />
                  <Field k="Escalation axis" v={t.escalationAxis ?? "none"} />
                  <Field k="Time to sign" v={t.timeToSignatureSec === null ? "not measured" : `${t.timeToSignatureSec}s`} />
                  <Field k="Rubber-stamp flag" v={stamp(t.rubberStampFlag)} />
                  <Field k="Gates" v={t.gateResult == null ? "not measured" : JSON.stringify(t.gateResult)} />
                </dl>
              </details>
            </li>
          ))}
        </ul>
      )}

      <AutonomousRegistry open={registryOpen} onClose={() => setRegistryOpen(false)} />
      <EscalatedList open={escOpen} onClose={() => setEscOpen(false)} />
    </section>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-mxm-content-tertiary">{k}</dt>
      <dd className="break-all text-mxm-content-secondary">{v}</dd>
    </div>
  );
}
