import { useMemo, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { AutonomousRegistry } from "@/features/cockpit/AutonomousRegistry";
import { EscalatedList } from "@/features/cockpit/EscalatedList";
import { TierHeader } from "./TierHeader";
import { type ExpandCmd, useExpandGroup } from "./useExpandGroup";

// Activity = what the AI did alone + its governance gates. RESULT/NULL fields (time-to-sign, gate result,
// rubber-stamp) render "not measured" (honest-pending §14), never 0. Full traceability (proposer,
// confirmer, escalation axis, gates) lives in each row's expand. Decision_Trace is append-only — read
// only here. Release/pause is operated per-NBA on the Cockpit (reuse, not a rebuilt invariant-bearing
// flow) — linked, not duplicated.
const stamp = (v: boolean | null): string => (v === null ? "not measured" : v ? "yes" : "no");

export function ActivityTier({ ready, cmd }: { ready: boolean; cmd: ExpandCmd | null }) {
  const traces = trpc.observatory.traces.useQuery(undefined, { enabled: ready });
  const [registryOpen, setRegistryOpen] = useState(false);
  const [escOpen, setEscOpen] = useState(false);
  const rows = traces.data ?? [];
  const keys = useMemo(() => (traces.data ?? []).map((t) => t.traceId), [traces.data]);
  const { isOpen, setOpen } = useExpandGroup(cmd, keys);

  return (
    <section className="mt-8" aria-label="What the AI did alone">
      <TierHeader title="Activity & trace" count={traces.isSuccess ? rows.length : undefined}>
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
      </TierHeader>

      {!ready || traces.isLoading ? (
        <div className="h-24 animate-pulse rounded-mxm border border-mxm-border" />
      ) : traces.isError ? (
        <p className="text-sm text-mxm-red">Couldn&apos;t read traces — try again.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-mxm-content-secondary">No autonomous actions recorded yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((t) => (
            <li key={t.traceId}>
              <Disclosure
                open={isOpen(t.traceId)}
                onOpenChange={(o) => setOpen(t.traceId, o)}
                title={
                  <span className="font-normal">
                    {t.action} <span className="text-mxm-content-secondary">· {t.effectiveLevelApplied ?? "not measured"}</span>
                  </span>
                }
                trailing={<span className="text-xs font-normal text-mxm-content-tertiary tabular-nums">{t.ts.slice(0, 10)}</span>}
              >
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <Field k="Proposer" v={t.proposerId} />
                  <Field k="Confirmer" v={t.confirmerId ?? "auto (none)"} />
                  <Field k="Independent" v={t.independenceGuaranteed === null ? "not measured" : t.independenceGuaranteed ? "yes" : "no"} />
                  <Field k="Escalation axis" v={t.escalationAxis ?? "none"} />
                  <Field k="Time to sign" v={t.timeToSignatureSec === null ? "not measured" : `${t.timeToSignatureSec}s`} />
                  <Field k="Rubber-stamp flag" v={stamp(t.rubberStampFlag)} />
                  <Field k="Gates" v={t.gateResult == null ? "not measured" : JSON.stringify(t.gateResult)} />
                </dl>
              </Disclosure>
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
