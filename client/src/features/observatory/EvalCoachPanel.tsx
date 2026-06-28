import { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { trpc } from "@/lib/trpc";

// EPIC-B4 coach — the ONLY path that RAISES autonomy above the LOW floor, from the app (no .ts). You author
// your OWN golden set (the right call per real member), the eval grades the learning motor, you coach the
// misses (approve a lesson in Learning) until it passes, then you sign to promote. §14: you never type a
// grade — authoring is INPUT, the verdict is produced, promotion is your signature.
type Verdict = { status: "red" | "green"; passRate: number; kappa: number | null; n: number };

const csvOf = (ids: string[]) => "restaurant_id,correct_label\n" + ids.map((r) => `${r},`).join("\n") + "\n";
const parseCsv = (text: string): { restaurantId: string; correctLabel: string }[] =>
  text
    .trim()
    .split(/\r?\n/)
    .slice(1) // drop header
    .map((l) => l.split(","))
    .map((c) => ({ restaurantId: (c[0] ?? "").trim(), correctLabel: (c[1] ?? "").trim().toUpperCase() }))
    .filter((r) => r.restaurantId && /^A[1-8]$/.test(r.correctLabel));

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

function CoachModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
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
  const ready = cohortId.trim() && intent.trim() && version.trim();
  const reset = () => { setErr(null); setMsg(null); };

  const onDownload = async () => {
    reset();
    try {
      const t = await utils.eval.template.fetch({ cohortId: cohortId.trim(), intent: intent.trim() });
      if (!t.week || t.restaurantIds.length === 0) { setErr("No members for that cohort — check the cohort id."); return; }
      setWeek(t.week);
      setIds(t.restaurantIds);
      const url = URL.createObjectURL(new Blob([csvOf(t.restaurantIds)], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `golden-set-${cohortId.trim()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`Template ready: ${t.restaurantIds.length} members. Fill correct_label (A1–A8), then upload.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load the cohort.");
    }
  };

  const onUpload = async (file: File) => {
    reset();
    setVerdict(null);
    setMisses(null);
    setReleased(null);
    const rows = parseCsv(await file.text());
    if (fileRef.current) fileRef.current.value = "";
    if (rows.length === 0) { setErr("No valid rows (each needs a correct_label A1–A8)."); return; }
    if (!week) { setErr("Download the template first (it sets the week)."); return; }
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
        <Field label="cohort id" value={cohortId} onChange={setCohortId} placeholder="pizza_zone_centro_long_tail_v1" />
        <Field label="intent" value={intent} onChange={setIntent} placeholder="INT-…" />
        <Field label="version (a name you pick)" value={version} onChange={setVersion} placeholder="my-gs-medium" />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => void onDownload()} disabled={!ready}>1 · Download template</Button>
        <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={!ready || ids.length === 0 || author.isPending}>
          {author.isPending ? "Grading…" : "2 · Upload filled CSV"}
        </Button>
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
