import { useRef, useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { trpc } from "@/lib/trpc";
import { NBA_CATALOG } from "@/features/cockpit/nbaCatalog";
import { INTENT_CATALOG, cohortOptionLabel, csvTemplate, parseGoldenCsv } from "./evalCoachFormat";

// EPIC-B4 coach — the ONLY path that RAISES autonomy above the LOW floor, from the app (no .ts). You author
// your OWN golden set (the right call per real member), the eval grades the learning motor, you coach the
// misses (approve a lesson in Learning) until it passes, then you sign to promote. §14: you never type a
// grade — authoring is INPUT, the verdict is produced, promotion is your signature.
type Verdict = { status: "red" | "green"; passRate: number; kappa: number | null; n: number };

// the legend embedded in the downloaded CSV (closed A1..A8 reference, not a §14 result — see nbaCatalog.ts)
const CSV_LEGEND = NBA_CATALOG.map((e) => `${e.code} — ${e.name}`);

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-mxm-content-secondary">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-mxm border border-mxm-border bg-transparent px-2 py-1 font-mono text-mxm-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand"
      />
    </label>
  );
}

// A native <select> picker so the operator chooses real cohorts/topics instead of typing opaque ids blind
// (the root cause of "it won't let me upload anything": a wrong free-text id → template fetch failed → the
// upload button stayed disabled). Native = free WCAG a11y (keyboard, labelable).
function Picker({ label, value, onChange, disabled, children }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-mxm-content-secondary">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-mxm border border-mxm-border bg-mxm-bg-elevated px-2 py-1 text-mxm-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand disabled:opacity-50"
      >
        {children}
      </select>
    </label>
  );
}

function CoachModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const cohorts = trpc.cohorts.list.useQuery(undefined, { enabled: open });
  const author = trpc.eval.authorFromTemplate.useMutation();
  const run = trpc.eval.run.useMutation();
  const promote = trpc.eval.promote.useMutation();

  const [cohortId, setCohortId] = useState("");
  const [intent, setIntent] = useState("");
  const [version, setVersion] = useState("");
  const [week, setWeek] = useState<string | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [coachable, setCoachable] = useState(true);
  const [misses, setMisses] = useState<{ restaurantId: string | null; aiLabel: string; correctLabel: string }[] | null>(null);
  const [released, setReleased] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ready = Boolean(cohortId && intent && version.trim());
  const reset = () => { setErr(null); setMsg(null); };
  // picking a different cohort invalidates a previously-downloaded template (its members differ) — drop it so
  // the operator can never upload a CSV authored against a different cohort.
  const pickCohort = (v: string) => { setCohortId(v); setWeek(null); setIds([]); };

  const onDownload = async () => {
    reset();
    try {
      const t = await utils.eval.template.fetch({ cohortId, intent });
      if (!t.week || t.restaurantIds.length === 0) { setErr("This cohort has no members yet — pick another, or run the Cohorts screen first."); return; }
      setWeek(t.week);
      setIds(t.restaurantIds);
      const url = URL.createObjectURL(new Blob([csvTemplate(t.restaurantIds, CSV_LEGEND)], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `golden-set-${cohortId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`Template ready: ${t.restaurantIds.length} members. Open it, fill the correct_label column (A1–A8) for each row, then upload it below.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load the cohort.");
    }
  };

  const onUpload = async (file: File) => {
    reset();
    setVerdict(null);
    setMisses(null);
    setReleased(null);
    const rows = parseGoldenCsv(await file.text());
    if (fileRef.current) fileRef.current.value = "";
    if (!week) { setErr("Download the template first — it lists this cohort's members and sets the week."); return; }
    if (rows.length === 0) { setErr("No labelled rows found. Fill the correct_label column with A1–A8 for each restaurant, keep the header row, then upload."); return; }
    author.mutate(
      { cohortId: cohortId.trim(), intent: intent.trim(), version: version.trim(), targetLevel: "MEDIUM", week, rows },
      {
        onSuccess: (r) => { setVerdict(r.verdict); setCoachable(r.coachable); setMsg(`Authored ${r.authored} cases · graded.`); },
        onError: (e) => setErr(e.message),
      },
    );
  };

  const onRegrade = () =>
    run.mutate(
      { cohortId: cohortId.trim(), intent: intent.trim(), version: version.trim() },
      { onSuccess: (v) => { setVerdict(v); setMisses(null); setMsg("Re-graded."); }, onError: (e) => setErr(e.message) },
    );

  const onShowMisses = async () => {
    reset();
    try {
      const m = await utils.eval.misses.fetch({ cohortId: cohortId.trim(), intent: intent.trim(), version: version.trim() });
      setMisses(m.misses);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load misses.");
    }
  };

  const onPromote = () =>
    promote.mutate(
      { cohortId: cohortId.trim(), intent: intent.trim(), version: version.trim() },
      { onSuccess: (r) => { setReleased(r.releasedEvals); void utils.observatory.evalList.invalidate(); }, onError: (e) => setErr(e.message) },
    );

  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <Modal open={open} onClose={onClose} title="Raise autonomy with a golden set">
      <p className="max-w-[62ch] text-xs text-mxm-content-secondary">
        Author your own answer key for a cohort, let the AI take the exam, coach the misses until it passes,
        then sign to raise its autonomy. You never type a grade — the eval is measured; promotion is yours.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Picker label="cohort" value={cohortId} onChange={pickCohort} disabled={cohorts.isLoading}>
          <option value="">{cohorts.isLoading ? "Loading…" : "Select a cohort…"}</option>
          {(cohorts.data ?? []).map((c) => (
            <option key={c.cohort_id} value={c.cohort_id}>{cohortOptionLabel(c)}</option>
          ))}
        </Picker>
        <Picker label="topic" value={intent} onChange={setIntent}>
          <option value="">Select a topic…</option>
          {INTENT_CATALOG.map((i) => (
            <option key={i.intent_id} value={i.intent_id}>{i.label}</option>
          ))}
        </Picker>
        <Field label="version (a name you pick)" value={version} onChange={setVersion} placeholder="pizza-centro-jun" />
      </div>

      {cohorts.isSuccess && (cohorts.data?.length ?? 0) === 0 && (
        <p className="mt-2 text-xs text-mxm-content-tertiary">
          No cohorts yet — run the Cohorts screen (or &ldquo;Prepare cockpit&rdquo;) to build them, then come back.
        </p>
      )}

      <div className="mt-3">
        <Disclosure title="What do the labels (A1–A8) mean?">
          <ul className="space-y-1 text-xs">
            {NBA_CATALOG.map((e) => (
              <li key={e.code} className="text-mxm-content-secondary">
                <span className="font-mono text-mxm-content">{e.code}</span> · <span className="text-mxm-content">{e.name}</span>
                {e.money && (
                  <span className="ml-1 rounded bg-mxm-bg-secondary px-1 align-middle text-[0.6rem] uppercase text-mxm-content-tertiary">money</span>
                )}
                <span className="text-mxm-content-tertiary"> — {e.desc}</span>
              </li>
            ))}
          </ul>
        </Disclosure>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={() => void onDownload()} disabled={!ready}>1 · Download template</Button>
        <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={!ready || ids.length === 0 || author.isPending}>
          {author.isPending ? "Grading…" : "2 · Upload filled CSV"}
        </Button>
        {!ready ? (
          <span className="text-xs text-mxm-content-tertiary">Pick a cohort, a topic, and a version name to start.</span>
        ) : ids.length === 0 ? (
          <span className="text-xs text-mxm-content-tertiary">← download the template, fill the labels, then upload.</span>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="text/csv,.csv"
          className="sr-only"
          aria-label="Upload filled golden set CSV"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f); }}
        />
      </div>

      {msg && <p role="status" className="mt-2 text-xs text-mxm-green">{msg}</p>}
      {err && <p role="alert" className="mt-2 text-xs text-mxm-red">✕ {err}</p>}

      {verdict && (
        <div className="mt-4 rounded-mxm border border-mxm-border p-3">
          <div className="flex items-center gap-2 text-sm">
            <span className={verdict.status === "green" ? "font-semibold text-mxm-green" : "font-semibold text-mxm-red"}>
              {verdict.status === "green" ? "● passes" : "● not yet"}
            </span>
            <span className="tabular-nums text-mxm-content-secondary">
              pass {pct(verdict.passRate)} · κ {verdict.kappa === null ? "—" : verdict.kappa.toFixed(2)} · n {verdict.n}
            </span>
          </div>
          {!coachable && (
            <p className="mt-1 text-xs text-mxm-content-tertiary">
              Coaching is off — no model key set, so the eval grades the deterministic floor. Set the key to coach it up.
            </p>
          )}
          {verdict.status === "red" ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button variant="ghost" onClick={() => void onShowMisses()}>Show misses</Button>
              <Button variant="ghost" onClick={onRegrade} disabled={run.isPending}>{run.isPending ? "Re-grading…" : "Re-grade after coaching"}</Button>
              <span className="text-xs text-mxm-content-tertiary">Approve the right lesson in Learning, then re-grade.</span>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={onPromote} disabled={promote.isPending}>
                {promote.isPending ? "Signing…" : "Promote → MEDIUM (sign)"}
              </Button>
              {released && <span className="text-xs font-semibold text-mxm-green">Raised: released to {released} ✓</span>}
            </div>
          )}
          {misses && (
            <ul className="mt-3 max-h-40 space-y-1 overflow-auto text-xs">
              {misses.length === 0 ? (
                <li className="text-mxm-content-tertiary">No misses — every call matched your key.</li>
              ) : (
                misses.map((m, i) => (
                  <li key={`${m.restaurantId}-${i}`} className="text-mxm-content-secondary">
                    <span className="font-mono text-mxm-content">{m.restaurantId ?? "—"}</span>: AI said{" "}
                    <span className="font-mono text-mxm-red">{m.aiLabel}</span> · you say{" "}
                    <span className="font-mono text-mxm-green">{m.correctLabel}</span>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

// THE hero: the one path that raises the AI above the LOW floor (LOW→MEDIUM), and the operator's recurring
// "where do I update the evals" answer. Accent-bordered so it reads as the primary action of the screen.
export function EvalCoachPanel() {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-6 rounded-mxm border-2 border-mxm-brand bg-mxm-bg-elevated p-[clamp(1rem,2vw,1.25rem)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-mxm-brand">
            <span aria-hidden="true">↗</span> Raise autonomy — author a golden set
          </h2>
          <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-mxm-content-secondary">
            Today the AI is capped at <span className="font-medium text-mxm-content">LOW</span> until you prove it safe.
            Author your own answer key → the AI takes the exam → coach the misses (approve the right lesson) → re-grade →
            sign to promote, and it earns <span className="font-medium text-mxm-content">MEDIUM</span> for that cohort. You
            never type a grade — authoring is the input, the verdict is measured, promotion is your signature.
          </p>
        </div>
        {/* ghost, not primary: coral-on-white (primary) fails WCAG AA contrast; the hero's prominence comes
            from the accent border + heading, and the e2e axe gate is blocking. */}
        <Button variant="ghost" onClick={() => setOpen(true)}>
          Start
        </Button>
      </div>
      <CoachModal open={open} onClose={() => setOpen(false)} />
    </section>
  );
}
