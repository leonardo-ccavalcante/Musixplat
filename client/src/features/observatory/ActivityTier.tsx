import { Fragment, useId, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { AutonomousRegistry } from "@/features/cockpit/AutonomousRegistry";
import { EscalatedList } from "@/features/cockpit/EscalatedList";
import { CollapsibleTier } from "./CollapsibleTier";
import type { ObservatoryTrace } from "@shared/contracts_observatory";

const PREVIEW = 6; // a calm preview; "Show all" reveals the rest of the table in place

// Activity = what the AI did ALONE (origin='auto'), as a scannable table (when · what · freedom · mode ·
// checks). Each row EXPANDS to its full governance gates (proposer/confirmer/independence/escalation axis/
// time-to-sign/gate_result) — kept inline so the §3.10 trace detail is never lost. RESULT/NULL fields render
// "not measured" (§14), never 0. Decision_Trace is append-only; read-only here. Checks/expand are icon+text,
// never color-only. The rendered-title + reach view stays in the existing AutonomousRegistry ("Full registry").
export function ActivityTier({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const traces = trpc.observatory.traces.useQuery(undefined, { enabled: true });
  const [registryOpen, setRegistryOpen] = useState(false);
  const [escOpen, setEscOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [openRows, setOpenRows] = useState<Set<string>>(() => new Set());
  const rows = traces.data ?? [];
  const flagged = rows.filter((t) => t.rubberStampFlag === true).length;
  // "all clear" only when EVERY check was measured false — a NULL rubber_stamp_flag is pre-run, not clean
  // (§14): never fabricate a clean governance result from unmeasured data.
  const allMeasuredClean = rows.length > 0 && rows.every((t) => t.rubberStampFlag === false);

  const summary = !traces.isSuccess
    ? "· …"
    : rows.length === 0
      ? "· nothing autonomous yet"
      : `· ${rows.length} autonomous${
          flagged > 0 ? ` · ${flagged} to check` : allMeasuredClean ? " · all clear" : " · checks pending"
        }`;

  const shown = showAll ? rows : rows.slice(0, PREVIEW);
  const toggleRow = (id: string) =>
    setOpenRows((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <CollapsibleTier
        title="Activity"
        summary={summary}
        open={open}
        onOpenChange={onOpenChange}
        actions={
          <>
            {/* the rendered-title + reach view of every autonomous action */}
            <Button variant="ghost" onClick={() => setRegistryOpen(true)}>
              Full registry…
            </Button>
            <Button variant="ghost" onClick={() => setEscOpen(true)}>
              Escalations…
            </Button>
            <Link
              href="/cockpit"
              className="inline-flex min-h-[24px] items-center rounded-mxm px-2 text-sm text-mxm-content-secondary hover:text-mxm-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mxm-brand"
            >
              Release / pause on Cockpit →
            </Link>
          </>
        }
      >
        {traces.isLoading ? (
          <div className="h-24 animate-pulse rounded-mxm border border-mxm-border" />
        ) : traces.isError ? (
          <p className="text-sm text-mxm-red">Couldn&apos;t read traces — try again.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-mxm-content-secondary">No autonomous actions recorded yet.</p>
        ) : (
          <div className="overflow-hidden rounded-mxm border border-mxm-border">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-mxm-content-tertiary">
                  <th scope="col" className="px-3 py-2 font-normal">When</th>
                  <th scope="col" className="px-3 py-2 font-normal">What it did</th>
                  <th scope="col" className="px-3 py-2 font-normal">Freedom</th>
                  <th scope="col" className="px-3 py-2 font-normal">Mode</th>
                  <th scope="col" className="px-3 py-2 font-normal">Checks</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <ActivityRow key={t.traceId} t={t} open={openRows.has(t.traceId)} onToggle={() => toggleRow(t.traceId)} />
                ))}
                {rows.length > PREVIEW && (
                  <tr className="border-t border-mxm-border">
                    <td colSpan={5} className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setShowAll((v) => !v)}
                        className="rounded-mxm px-1 text-mxm-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mxm-brand"
                      >
                        {showAll ? "Show fewer" : `Show all ${rows.length} →`}
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleTier>
      <AutonomousRegistry open={registryOpen} onClose={() => setRegistryOpen(false)} />
      <EscalatedList open={escOpen} onClose={() => setEscOpen(false)} />
    </>
  );
}

function ActivityRow({ t, open, onToggle }: { t: ObservatoryTrace; open: boolean; onToggle: () => void }) {
  const id = useId();
  return (
    <Fragment>
      <tr className="border-t border-mxm-border">
        <td className="px-3 py-2">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            onClick={onToggle}
            className="flex items-center gap-1.5 rounded-mxm text-mxm-content-tertiary hover:text-mxm-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mxm-brand"
          >
            <span aria-hidden="true" className={`transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
            <span className="tabular-nums">{t.ts.slice(0, 10)}</span>
          </button>
        </td>
        <td className="px-3 py-2 text-mxm-content">{t.action}</td>
        <td className="px-3 py-2">
          <span className="rounded-mxm bg-mxm-bg-secondary px-1.5 py-0.5 text-mxm-content-secondary">
            {t.effectiveLevelApplied ?? "—"}
          </span>
        </td>
        <td className="px-3 py-2 text-mxm-content-secondary">{t.confirmerId === null ? "Alone" : "Reviewed"}</td>
        <td className="px-3 py-2">
          {t.rubberStampFlag === true ? (
            <span className="text-mxm-amber">⚠ to check</span>
          ) : t.rubberStampFlag === false ? (
            <span className="text-mxm-green">✓ clean</span>
          ) : (
            <span className="text-mxm-content-tertiary">— not measured</span>
          )}
        </td>
      </tr>
      <tr id={id} hidden={!open}>
        <td colSpan={5} className="bg-mxm-bg-secondary px-3 py-2">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <Field k="Proposer" v={t.proposerId} />
            <Field k="Confirmer" v={t.confirmerId ?? "auto (none)"} />
            <Field k="Independent" v={t.independenceGuaranteed === null ? "not measured" : t.independenceGuaranteed ? "yes" : "no"} />
            <Field k="Escalation axis" v={t.escalationAxis ?? "none"} />
            <Field k="Time to sign" v={t.timeToSignatureSec === null ? "not measured" : `${t.timeToSignatureSec}s`} />
            <Field k="Gates" v={t.gateResult == null ? "not measured" : JSON.stringify(t.gateResult)} />
          </dl>
        </td>
      </tr>
    </Fragment>
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
