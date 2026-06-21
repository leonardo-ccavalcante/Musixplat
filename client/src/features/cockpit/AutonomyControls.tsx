import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { trpc } from "@/lib/trpc";
import { LoadingState, ErrorState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";

// 02C:6b — Autonomy Controls: the human-editable boundary the motor is allowed to act within. THREE ops, each
// its own save with explicit loading/success/error state: (a) toggle which action_types each tier may
// auto-act on; (b) edit the two motor knobs by NAME (never a hard-coded literal, §3.8); (c) approve a pending
// Knowledge_Case so a learning grounds future runs (RLHF gate, BR-B16). No number is computed here (§14);
// every value READS motor.controls.get and writes via motor.controls.set. Toggles carry text + a ✓/○ glyph,
// so the on/off state never rests on color alone (WCAG 2.1 AA).

// The action_types the motor can be permitted to auto-act on. Kept in sync with the action catalog; a tier's
// allowed set is the intersection of this menu and what the human has toggled on.
const ACTION_TYPES = [
  "outreach_message",
  "menu_nudge",
  "price_review_flag",
  "quality_followup",
  "reactivation_ping",
] as const;

const KNOB_LABELS: Record<string, { label: string; hint: string }> = {
  motor_max_loops: { label: "Max hypothesis loops", hint: "How many hypotheses the motor may try before it escalates (≤3)." },
  motor_min_confidence: { label: "Min confidence to act", hint: "The confidence floor (0–1) the motor needs before acting alone." },
};

type SaveState = { status: "idle" | "saving" | "done" | "error"; msg?: string };
const IDLE: SaveState = { status: "idle" };

export function AutonomyControls({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ctl = trpc.motor.controls.get.useQuery(undefined, { enabled: open });
  const utils = trpc.useUtils();
  const set = trpc.motor.controls.set.useMutation();

  // Per-control save state, keyed so concurrent saves report independently (tier:<id>, knob:<key>, case:<id>).
  const [saving, setSaving] = useState<Record<string, SaveState>>({});
  // Local draft of each knob's text value (committed on Save), so typing doesn't fire a mutation per keystroke.
  const [knobDraft, setKnobDraft] = useState<Record<string, string>>({});

  const mark = (key: string, s: SaveState) => setSaving((m) => ({ ...m, [key]: s }));

  const apply = (key: string, input: Parameters<typeof set.mutate>[0]) => {
    mark(key, { status: "saving" });
    set.mutate(input, {
      onSuccess: () => {
        mark(key, { status: "done", msg: "Saved ✓" });
        void utils.motor.controls.get.invalidate();
      },
      onError: (e) => mark(key, { status: "error", msg: e.message }),
    });
  };

  const toggleAction = (tierId: string, current: string[], action: string) => {
    const next = current.includes(action) ? current.filter((a) => a !== action) : [...current, action];
    apply(`tier:${tierId}`, { tier_id: tierId, auto_actions: next });
  };

  const data = ctl.data;

  return (
    <Modal open={open} onClose={onClose} title="Autonomy Controls">
      <p className="mb-4 max-w-[60ch] text-xs leading-relaxed text-mxm-content-secondary">
        This is the boundary you approve. The AI only auto-acts on the actions you allow here,{" "}
        <b className="text-mxm-content">never money</b>. Approve a learning to let it ground future runs.
      </p>

      {ctl.isLoading ? (
        <LoadingState label="Loading controls…" />
      ) : ctl.isError || !data ? (
        <ErrorState />
      ) : (
        <div className="space-y-6">
          {/* (a) the approved action range, per tier */}
          <section aria-labelledby="ac-range">
            <h3 id="ac-range" className="text-[0.7rem] uppercase tracking-wide text-mxm-content-tertiary">
              Allowed actions — the motor&apos;s range
            </h3>
            {data.tiers.length === 0 ? (
              <p className="mt-2 rounded-mxm border border-mxm-border bg-mxm-bg-secondary p-3 text-xs text-mxm-content-secondary">
                No policy tiers found yet — run the engine to populate the governance tiers.
              </p>
            ) : (
              <ul className="mt-2 space-y-4">
                {data.tiers.map((t) => {
                  const st = saving[`tier:${t.tier_id}`] ?? IDLE;
                  return (
                    <li key={t.tier_id} className="rounded-mxm border border-mxm-border bg-mxm-bg-secondary p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-mxm-content">Tier {t.tier_id}</span>
                        <SaveBadge state={st} />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {ACTION_TYPES.map((a) => {
                          const on = t.auto_actions.includes(a);
                          return (
                            <button
                              key={a}
                              type="button"
                              role="switch"
                              aria-checked={on}
                              disabled={st.status === "saving"}
                              onClick={() => toggleAction(t.tier_id, t.auto_actions, a)}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand disabled:opacity-50",
                                on
                                  ? "border-mxm-green/50 bg-mxm-green/10 text-mxm-green"
                                  : "border-mxm-border text-mxm-content-secondary hover:text-mxm-content",
                              )}
                            >
                              <span aria-hidden>{on ? "✓" : "○"}</span>
                              {a}
                              <span className="sr-only">{on ? "allowed" : "not allowed"}</span>
                            </button>
                          );
                        })}
                      </div>
                      {/* any action_type already on the tier but outside our menu — surfaced read-only, not hidden */}
                      {t.auto_actions.filter((a) => !ACTION_TYPES.includes(a as (typeof ACTION_TYPES)[number])).length > 0 && (
                        <p className="mt-2 text-[0.68rem] text-mxm-content-tertiary">
                          Also on (other):{" "}
                          {t.auto_actions.filter((a) => !ACTION_TYPES.includes(a as (typeof ACTION_TYPES)[number])).join(", ")}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* (b) the loop knobs, by name */}
          <section aria-labelledby="ac-knobs">
            <h3 id="ac-knobs" className="text-[0.7rem] uppercase tracking-wide text-mxm-content-tertiary">
              Motor knobs
            </h3>
            <ul className="mt-2 space-y-3">
              {data.knobs.map((k) => {
                const meta = KNOB_LABELS[k.key];
                const st = saving[`knob:${k.key}`] ?? IDLE;
                const draft = knobDraft[k.key] ?? k.value;
                const dirty = draft !== k.value;
                return (
                  <li key={k.key} className="rounded-mxm border border-mxm-border bg-mxm-bg-secondary p-3">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor={`knob-${k.key}`} className="text-xs font-medium text-mxm-content">
                        {meta?.label ?? k.key}
                      </label>
                      <SaveBadge state={st} />
                    </div>
                    {meta?.hint && <p className="mt-0.5 text-[0.68rem] text-mxm-content-tertiary">{meta.hint}</p>}
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        id={`knob-${k.key}`}
                        value={draft}
                        inputMode="decimal"
                        onChange={(e) => setKnobDraft((d) => ({ ...d, [k.key]: e.target.value }))}
                        className="w-28 rounded-mxm border border-mxm-border bg-mxm-bg px-2 py-1 text-sm text-mxm-content tabnum focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand"
                      />
                      <span className="font-mono text-[0.68rem] text-mxm-content-tertiary">{k.key}</span>
                      <Button
                        variant="ghost"
                        disabled={!dirty || st.status === "saving"}
                        onClick={() => apply(`knob:${k.key}`, { knob_key: k.key as "motor_max_loops" | "motor_min_confidence", knob_value: draft })}
                        className="ml-auto"
                      >
                        Save
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* (c) the RLHF queue — approve a learning to ground future runs */}
          <section aria-labelledby="ac-learn">
            <h3 id="ac-learn" className="text-[0.7rem] uppercase tracking-wide text-mxm-content-tertiary">
              Pending learnings — approve to ground future runs
            </h3>
            {data.pending_cases.length === 0 ? (
              <p className="mt-2 rounded-mxm border border-mxm-border bg-mxm-bg-secondary p-3 text-xs text-mxm-content-secondary">
                No learnings waiting on you — nothing to approve.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {data.pending_cases.map((c) => {
                  const st = saving[`case:${c.kb_case_id}`] ?? IDLE;
                  const approved = st.status === "done";
                  return (
                    <li
                      key={c.kb_case_id}
                      className="flex flex-wrap items-center gap-2 rounded-mxm border border-mxm-border bg-mxm-bg-secondary p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-mxm-content">{c.pattern || "(no pattern)"}</p>
                        <p className="text-[0.68rem] text-mxm-content-tertiary">outcome: {c.outcome || "—"}</p>
                      </div>
                      <SaveBadge state={st} />
                      <Button
                        variant="ghost"
                        disabled={st.status === "saving" || approved}
                        onClick={() => apply(`case:${c.kb_case_id}`, { approve_case_id: c.kb_case_id })}
                      >
                        {approved ? "Approved ✓" : st.status === "saving" ? "Approving…" : "Approve"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

// Inline save status — text-carried (not color-only): role=status announces saving/done, role=alert announces error.
function SaveBadge({ state }: { state: SaveState }) {
  if (state.status === "idle") return null;
  if (state.status === "saving")
    return (
      <span role="status" aria-live="polite" className="text-[0.68rem] text-mxm-content-secondary">
        Saving…
      </span>
    );
  if (state.status === "done")
    return (
      <span role="status" className="flex items-center gap-1 text-[0.68rem] text-mxm-green">
        <span aria-hidden>✓</span> {state.msg ?? "Saved"}
      </span>
    );
  return (
    <span role="alert" className="flex items-center gap-1 text-[0.68rem] text-mxm-red">
      <span aria-hidden>!</span> {state.msg ?? "Failed"}
    </span>
  );
}
