import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { trpc } from "@/lib/trpc";
import { PROBLEM_TYPES } from "@shared/problem_types";

// 05D L3 — "Teach a problem type": a guided form for a senior manager to register a NEW diagnosis type at
// runtime (no source edit). The operator owns the FRAME (name / area / concentration / hypotheses); the
// MEASUREMENT is bound to an existing detector (measured_by) or "none → routes to a human" (the §14-honest
// option, never a fabricated number). Producer options come from PROBLEM_TYPES (the builtins' single home,
// never a re-hardcoded list). Manager-gating is enforced server-side; a non-manager gets a FORBIDDEN error
// surfaced here (role=alert, text not color-only). WCAG: labelled fields, aria-live status, focus-trap Modal.

const AREAS = ["finance", "performance", "product", "operations"] as const;
const DIMS = ["zone", "cuisine"] as const;
const PRODUCERS = Object.values(PROBLEM_TYPES).map((d) => ({ value: d.problem_type, label: d.label }));
const FIELD = "w-full rounded-mxm border border-mxm-border bg-mxm-bg px-2 py-1 text-sm text-mxm-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand";

export function TeachTypeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const define = trpc.diagnosis.defineType.useMutation();
  const [slug, setSlug] = useState("");
  const [label, setLabel] = useState("");
  const [area, setArea] = useState<(typeof AREAS)[number]>("operations");
  const [dim, setDim] = useState<(typeof DIMS)[number]>("zone");
  const [measuredBy, setMeasuredBy] = useState(""); // "" ⇒ none → route to a human
  const [hyps, setHyps] = useState<string[]>([""]);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const cleanHyps = hyps.map((h) => h.trim()).filter(Boolean);
  const canSubmit = slug.trim().length > 1 && label.trim().length > 0 && cleanHyps.length > 0 && !define.isPending;

  const submit = () => {
    setMsg(null);
    define.mutate(
      {
        problem_type: slug.trim(),
        label: label.trim(),
        area_type: area,
        concentration_dim: dim,
        measured_by: measuredBy || null,
        hypotheses: cleanHyps,
      },
      {
        onSuccess: (r) => {
          setMsg({
            kind: "ok",
            text: r.measurable
              ? `Taught "${r.problem_type}" ✓ — measured via the ${measuredBy} detector.`
              : `Taught "${r.problem_type}" ✓ — no detector bound, so it routes to a human until you bind one.`,
          });
          setSlug("");
          setLabel("");
          setMeasuredBy("");
          setHyps([""]);
        },
        onError: (e) => setMsg({ kind: "err", text: e.message }),
      },
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="Teach a problem type">
      <p className="mb-4 max-w-[60ch] text-xs leading-relaxed text-mxm-content-secondary">
        Register a new kind of problem the engine should watch for. You give it a name, a likely cause list,
        and pick which existing detector measures it — or <b className="text-mxm-content">none</b>, and it
        routes to a human until a detector is bound. Once a type is used in a diagnosis, its definition is
        frozen (so past numbers can&apos;t silently change).
      </p>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field id="tt-slug" label="Name (slug)" hint="lowercase, e.g. weekend_blackout">
            <input id="tt-slug" className={FIELD} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="weekend_blackout" />
          </Field>
          <Field id="tt-label" label="Label" hint="shown on screen">
            <input id="tt-label" className={FIELD} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Weekend blackout" />
          </Field>
          <Field id="tt-area" label="Area (routing)">
            <select id="tt-area" className={FIELD} value={area} onChange={(e) => setArea(e.target.value as (typeof AREAS)[number])}>
              {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field id="tt-dim" label="Concentration axis">
            <select id="tt-dim" className={FIELD} value={dim} onChange={(e) => setDim(e.target.value as (typeof DIMS)[number])}>
              {DIMS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
        </div>

        <Field id="tt-measured" label="Measured by" hint={measuredBy ? "uses this existing detector" : "no detector — routes to a human (can't measure yet)"}>
          <select id="tt-measured" className={FIELD} value={measuredBy} onChange={(e) => setMeasuredBy(e.target.value)}>
            <option value="">None — route to a human</option>
            {PRODUCERS.map((p) => <option key={p.value} value={p.value}>{p.label} ({p.value})</option>)}
          </select>
        </Field>

        <fieldset>
          <legend className="text-xs font-medium text-mxm-content">Candidate causes (hypotheses)</legend>
          <p className="mb-1.5 text-[0.68rem] text-mxm-content-tertiary">The AI only RANKS these — it never invents one (§8). At least one.</p>
          <div className="space-y-2">
            {hyps.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  aria-label={`Hypothesis ${i + 1}`}
                  className={FIELD}
                  value={h}
                  onChange={(e) => setHyps((s) => s.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder="e.g. staff scheduling gap"
                />
                {hyps.length > 1 && (
                  <button type="button" aria-label={`Remove hypothesis ${i + 1}`} onClick={() => setHyps((s) => s.filter((_, j) => j !== i))} className="rounded-mxm border border-mxm-border px-2 py-1 text-xs text-mxm-content-secondary hover:text-mxm-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand">
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          {hyps.length < 10 && (
            <Button variant="ghost" onClick={() => setHyps((s) => [...s, ""])} className="mt-2">+ Add cause</Button>
          )}
        </fieldset>

        <div className="flex items-center gap-3 border-t border-mxm-border pt-3">
          <Button onClick={submit} disabled={!canSubmit} aria-disabled={!canSubmit}>
            {define.isPending ? "Teaching…" : "Teach this type"}
          </Button>
          {msg && (
            <span
              role={msg.kind === "err" ? "alert" : "status"}
              aria-live="polite"
              className={msg.kind === "err" ? "flex items-center gap-1 text-xs text-mxm-red" : "flex items-center gap-1 text-xs text-mxm-green"}
            >
              <span aria-hidden>{msg.kind === "err" ? "!" : "✓"}</span> {msg.text}
            </span>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-mxm-content">{label}</label>
      {hint && <p className="mb-1 text-[0.68rem] text-mxm-content-tertiary">{hint}</p>}
      {children}
    </div>
  );
}
