import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { LoadingState, ErrorState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { DiagnosisBoard } from "@/features/diagnosis/DiagnosisBoard";
import { DossierModal } from "@/features/diagnosis/DossierModal";
import { SpineTimeline, type SpineNode } from "@/features/diagnosis/SpineTimeline";
import { ArtifactQueue, type ArtifactAction } from "@/features/diagnosis/ArtifactQueue";
import { ArtifactModal } from "@/features/diagnosis/ArtifactModal";
import { DiagnosisStepsModal } from "@/features/diagnosis/DiagnosisStepsModal";
import { DecisionModal } from "@/features/diagnosis/DecisionModal";
import { SituationRoom } from "@/features/diagnosis/SituationRoom";
import type { DiagnosisListRow } from "@shared/contracts_05b";
import type { ArtifactRow } from "@shared/contracts_05c";

// 05B/05C — Support · Diagnosis = the operable spine console. The operator drives the WHOLE spine IN-PRODUCT
// (no terminal): Run flow = reportProblem → diagnosis.run → (if dossier complete) artifact.generate; then
// the human gate (approve/reject/escalate) writes a 4-eyes trace; the 1:10 node reflects the derived
// leverage. Every number is PRODUCED server-side and only READ here. dev-login mints the POOL-PAY operator.
export function DiagnosisPage() {
  const [ready, setReady] = useState(false);
  const [openRow, setOpenRow] = useState<DiagnosisListRow | null>(null);
  const [stepsRow, setStepsRow] = useState<DiagnosisListRow | null>(null);
  const [decideRow, setDecideRow] = useState<DiagnosisListRow | null>(null);
  const [openArtifact, setOpenArtifact] = useState<ArtifactRow | null>(null);
  const [busyArtifact, setBusyArtifact] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function login(attempt = 0): Promise<void> {
      try {
        const r = await fetch("/auth/dev-login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ user_id: "U-PAY-001" }),
        });
        if (!r.ok) throw new Error(String(r.status));
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled && attempt < 15) setTimeout(() => void login(attempt + 1), 500);
        else if (!cancelled) setReady(true);
      }
    }
    void login();
    return () => {
      cancelled = true;
    };
  }, []);

  const list = trpc.diagnosis.list.useQuery(undefined, { enabled: ready });
  const rows = useMemo(() => (list.data ?? []) as DiagnosisListRow[], [list.data]);
  const summary = trpc.diagnosis.silentSummary.useQuery(undefined, { enabled: ready });
  const totalSilent = summary.data?.distinctSilent ?? 0;
  const artifactsQ = trpc.artifact.list.useQuery(undefined, { enabled: ready });
  const artifacts = useMemo(() => (artifactsQ.data ?? []) as ArtifactRow[], [artifactsQ.data]);
  const health = trpc.roi.summary.useQuery(undefined, { enabled: ready });
  // 05D Part C — decision #2 audit: what Part D auto-approved by measurement (verified_fixed).
  const verifiedQ = trpc.diagnosis.recentlyVerified.useQuery(undefined, { enabled: ready });
  const verified = verifiedQ.data ?? [];

  const utils = trpc.useUtils();
  const report = trpc.diagnosis.reportProblem.useMutation();
  const run = trpc.diagnosis.run.useMutation();
  const generate = trpc.artifact.generate.useMutation();
  const decide = trpc.artifact.decide.useMutation();
  const decideDiagnosis = trpc.diagnosis.decide.useMutation();
  const [runMsg, setRunMsg] = useState<{ status: "idle" | "running" | "done" | "error"; text?: string }>({
    status: "idle",
  });
  const running = runMsg.status === "running";

  async function refetchAll(): Promise<void> {
    await Promise.all([
      utils.diagnosis.list.invalidate(),
      utils.diagnosis.silentSummary.invalidate(),
      utils.diagnosis.recentlyVerified.invalidate(),
      utils.artifact.list.invalidate(),
      utils.roi.summary.invalidate(),
    ]);
  }

  // Run flow — intake → diagnose → (complete ⇒) generate artifact. Fail-closed surfaces honestly.
  async function runFlow(): Promise<void> {
    setRunMsg({ status: "running" });
    try {
      // Operate on a REAL restaurant from the pool — never the demo fixture R-PAY-001 (absent in prod ⇒ 400).
      // Empty pool ⇒ honest message pointing to the Situation Room (the real intake), no crash.
      const sample = await utils.diagnosis.sampleRestaurant.fetch();
      if (!sample) {
        setRunMsg({ status: "error", text: "No restaurant in this pool yet — upload data in the Situation Room first." });
        return;
      }
      const rep = await report.mutateAsync({
        restaurantId: sample.restaurantId,
        criticality: "critical",
      });
      const out = await run.mutateAsync({ problemId: rep.problem_id });
      let tail = "";
      if (out.dossier_emitted) {
        const art = await generate.mutateAsync({ problemId: rep.problem_id });
        tail = art.status === "generated" ? " · artifact ready for review" : ` · artifact ${art.status}`;
      } else {
        tail = ` · dossier partial (${out.dossier_gaps.join(",")}) — no artifact`;
      }
      await refetchAll();
      setRunMsg({
        status: "done",
        // §14 honesty: an unmeasurable type (a live type with no bound producer) reports NULL counts — show
        // "can't measure yet", never a fabricated 0.
        text:
          out.affected === null
            ? `Diagnosed · can't measure yet (no detector bound) — routed to a human${tail}`
            : `Diagnosed · ${out.affected} affected · ${out.silent} silent · €${out.revenue_lost} · route ${out.route}${tail}`,
      });
    } catch (e) {
      setRunMsg({ status: "error", text: e instanceof Error ? e.message : "run failed (fail-closed)" });
    }
  }

  function onDecide(artifactId: string, action: ArtifactAction): void {
    setBusyArtifact(artifactId);
    decide.mutate(
      { artifactId, action },
      {
        onSettled: () => setBusyArtifact(null),
        onSuccess: () => {
          setOpenArtifact(null); // close the viewer so the queue reflects the new (server) status
          void refetchAll();
        },
      },
    );
  }

  const revenue = rows.reduce((s, r) => s + (r.revenue_lost ?? 0), 0);
  const decided = artifacts.filter((a) => a.status !== "pending_review").length;
  const ratio = health.data?.ratio ?? null;
  const nodes: SpineNode[] = [
    { key: "inbound", label: "Inbound", value: `${rows.filter((r) => r.origin === "reactive").length} ticket(s)`, done: rows.length > 0 },
    { key: "diagnosis", label: "Diagnosis", value: `${rows.length} diagnosed`, done: rows.length > 0 },
    { key: "silent", label: "Silent", value: `${totalSilent} surfaced`, done: totalSilent > 0 },
    { key: "impact", label: "Impact", value: `€${revenue}`, done: revenue > 0 },
    { key: "dossier", label: "Dossier", value: `${rows.filter((r) => !r.needs_human).length} ready`, done: rows.length > 0 },
    { key: "artifact", label: "Artifact", value: `${artifacts.length} generated`, done: artifacts.length > 0 },
    { key: "gate", label: "Human gate", value: `${decided} decided`, done: decided > 0 },
    { key: "ratio", label: "1:10 health", value: ratio == null ? "no signal" : `${ratio} : 1`, done: ratio != null },
  ];

  return (
    <main className="mx-auto max-w-screen-xl p-[clamp(1rem,2vw,2rem)]">
      <header className="mb-6">
        <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-tight text-mxm-content">
          Support · Diagnosis
        </h1>
        <p className="mt-1.5 max-w-[64ch] text-sm leading-relaxed text-mxm-content-secondary [hyphens:auto] [text-align:justify]">
          The problem the ticket hides: the silent ones and the pattern, found before they become churn —
          diagnosed, quantified, turned into an artifact, gated by a human, measured as 1:10.
        </p>
        <p className="mt-2 text-xs text-mxm-content-tertiary">
          Honesty: reasoning = <span className="text-mxm-content-secondary">deterministic</span> (LLM optional,
          numbers always from SQL) · route = <span className="text-mxm-content-secondary">stub</span> (1
          deterministic rule) · 1:10 = <span className="text-mxm-content-secondary">provisional</span>
          (efficiency, not 2-gate confirmed). No field renders green without a producer.
        </p>
        {ready && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => void runFlow()} disabled={running} className="text-mxm-content-inverted">
              {running ? "Running flow…" : "Run flow"}
            </Button>
            <span
              aria-live="polite"
              className={runMsg.status === "error" ? "text-sm text-mxm-red" : "text-sm text-mxm-content-secondary"}
            >
              {runMsg.status === "running" && "Reporting → diagnosing → generating…"}
              {runMsg.status === "done" && runMsg.text}
              {runMsg.status === "error" && `Fail-closed: ${runMsg.text}`}
            </span>
          </div>
        )}
      </header>

      {ready && <SpineTimeline nodes={nodes} />}

      {ready && <SituationRoom onDone={() => void refetchAll()} />}

      {!ready || list.isLoading ? (
        <LoadingState label={!ready ? "Signing in…" : "Hunting silent ones…"} />
      ) : list.isError ? (
        <ErrorState />
      ) : (
        <>
          <DiagnosisBoard rows={rows} onOpen={setOpenRow} onSteps={setStepsRow} onDecide={setDecideRow} />
          {verified.length > 0 && (
            <section
              aria-label="Auto-verified by measurement"
              className="mt-4 rounded-mxm border border-mxm-border bg-mxm-bg-elevated px-[clamp(0.75rem,1.5vw,1.25rem)] py-3"
            >
              <h2 className="text-sm font-semibold text-mxm-content">
                Auto-verified by measurement{" "}
                <span className="text-xs font-normal text-mxm-content-secondary">
                  · the re-measurement proved these closed (you have visibility, no action needed)
                </span>
              </h2>
              <ul className="mt-2 grid gap-1.5">
                {verified.map((v) => (
                  <li key={v.kb_case_id} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                    <span className="rounded-full border border-mxm-brand px-2 py-0.5 font-medium text-mxm-brand">✓ verified</span>
                    <span className="text-mxm-content-secondary">{v.area_type}</span>
                    <span className="text-mxm-content">{v.pattern ?? "n/a"}</span>
                    {v.resolution && <span className="text-mxm-content-secondary">— {v.resolution}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <ArtifactQueue artifacts={artifacts} onDecide={onDecide} onOpen={setOpenArtifact} busyId={busyArtifact} />
        </>
      )}

      <DecisionModal
        row={decideRow}
        onClose={() => setDecideRow(null)}
        pending={decideDiagnosis.isPending}
        errorMsg={decideDiagnosis.error?.message ?? null}
        onSubmit={(areaType, rationale) =>
          decideRow &&
          decideDiagnosis.mutate(
            { problemId: decideRow.problem_id, areaType, rationale },
            { onSuccess: () => { setDecideRow(null); void refetchAll(); } },
          )
        }
      />
      <DossierModal row={openRow} onClose={() => setOpenRow(null)} />
      <DiagnosisStepsModal
        row={stepsRow}
        artifact={stepsRow ? artifacts.find((a) => a.problem_id === stepsRow.problem_id) ?? null : null}
        onClose={() => setStepsRow(null)}
        onOpenDossier={(r) => {
          setStepsRow(null);
          setOpenRow(r);
        }}
      />
      <ArtifactModal
        artifact={openArtifact}
        onClose={() => setOpenArtifact(null)}
        onDecide={onDecide}
        busyId={busyArtifact}
      />
    </main>
  );
}
