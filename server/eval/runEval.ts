// EPIC-B4 — the golden-set eval PRODUCER. Runs the AI-under-eval on a version's golden cases, grades
// deterministically, computes Fleiss κ (SQL) + red-team, writes the Eval_Cell verdict [V], and
// AUTO-DOWNGRADES released_evals on fail. It NEVER raises released_evals — promotion is a human action
// (server/routers/eval.ts → eval.promote · 00_vision §: promote = human + evidence, downgrade = auto).
// §2/§14: the number (pass_rate, κ, status) is SQL/math; the LLM is ONLY the evaluated, never the grader.
import { query, withTx } from "../db/pool.js";
import { motorAnswer } from "./motorAnswer.js";

/** The AI under evaluation: given a golden case scenario, which call (NBA action_code A1–A8) does it make? */
export interface EvalProvider {
  answer(scenario: unknown): Promise<string>;
}

/** Hermetic stand-in for tests (§14: same labels ⇒ same verdict, no network). A case carries `ai_label`
 *  to force a known answer, so the verdict is reproducible and provider-independent. */
export const deterministicEvalProvider: EvalProvider = {
  answer: (scenario) => Promise.resolve(String((scenario as { ai_label?: string } | null)?.ai_label ?? "")),
};

/** The REAL AI under eval (demo wiring, operator decision: real motor + fixture fallback). Runs the actual
 *  motor on the case's (restaurant_id, week); if the motor has no attributable lever (A8/no data) it falls
 *  back to the seeded `ai_label_fallback` so the demo never goes empty. The number stays the motor's. */
export const motorEvalProvider: EvalProvider = {
  answer: async (scenario) => {
    const s = scenario as { restaurant_id?: string; week?: string; ai_label_fallback?: string } | null;
    if (!s?.restaurant_id || !s?.week) return String(s?.ai_label_fallback ?? "A8"); // A8 (no-act), never "" (latent footgun)
    const code = await motorAnswer(s.restaurant_id, s.week);
    return code === "A8" ? String(s.ai_label_fallback ?? "A8") : code;
  },
};

async function knobNum(key: string): Promise<number> {
  const r = await query<{ value: string }>(`select value from catalog."Config_Knobs" where key=$1`, [key]);
  return Number(r[0]?.value); // missing knob ⇒ NaN ⇒ every `>=` false ⇒ status red (fail-closed §3.8)
}

export interface EvalVerdict {
  cohortId: string; intent: string; version: string;
  n: number; passRate: number; kappa: number | null;
  redteamIndependent: boolean; status: "red" | "green"; downgraded: boolean;
}

export async function runEval(
  cohortId: string,
  intent: string,
  version: string,
  provider: EvalProvider = deterministicEvalProvider,
): Promise<EvalVerdict> {
  // 1. the golden cases for this cell
  const cases = await query<{ eval_case_id: string; scenario: unknown; correct_label: string }>(
    `select eval_case_id, scenario, correct_label from gov."Eval_Case"
      where cohort_id=$1 and intent=$2 and version=$3`,
    [cohortId, intent, version],
  );
  if (cases.length === 0) throw new Error("runEval: no golden cases for this cell (fail-closed)");

  // 2. run the AI-under-eval on each case → its label (the ONLY LLM step)
  let correct = 0;
  for (const c of cases) {
    const aiLabel = await provider.answer(c.scenario);
    if (aiLabel === c.correct_label) correct++;
  }
  const n = cases.length;
  const passRate = Number((correct / n).toFixed(4));

  // 3. Fleiss κ — deterministic SQL over THIS cell's human judge labels (never the model's number).
  //    node-pg returns `numeric` as a STRING (precision-safe) ⇒ coerce to number so the gate compares
  //    numerically (not by string coercion) and the typed verdict is honest. NULL stays NULL (undefined κ).
  const kappaRaw =
    (await query<{ kappa: string | null }>(`select gov.fn_fleiss_kappa($1,$2,$3) as kappa`, [cohortId, intent, version]))[0]
      ?.kappa ?? null;
  const kappa = kappaRaw === null ? null : Number(kappaRaw);

  // 4. red-team independence: every judge of this cell is a non-AI principal (a co-biased AI judge breaks it).
  //    bool_and over zero rows is NULL ⇒ coalesce to false (fail-closed: no judges ⇒ not independent).
  const redteamIndependent =
    (await query<{ ind: boolean | null }>(
      `select bool_and(jl.judge_id not like 'U-AI%') as ind
         from gov."Eval_Judge_Label" jl join gov."Eval_Case" ec on ec.eval_case_id=jl.eval_case_id
        where ec.cohort_id=$1 and ec.intent=$2 and ec.version=$3`,
      [cohortId, intent, version],
    ))[0]?.ind ?? false;

  // 5. status rule — all gates pass, thresholds by NAME (§3.8)
  const [passT, minN, kMin] = await Promise.all([knobNum("eval_pass_threshold"), knobNum("eval_min_n"), knobNum("eval_kappa_min")]);
  const green = passRate >= passT && n >= minN && kappa !== null && kappa >= kMin && redteamIndependent;
  const status: "red" | "green" = green ? "green" : "red";

  // 6/7. write the verdict [V]; AUTO-DOWNGRADE released_evals→LOW on red ([C], deterministic); on green
  //      LEAVE released_evals untouched — raising it is the human's promotion (INV-3).
  const prov: Record<string, string> = {
    status: "[V]", n_golden_cases: "[V]", kappa: "[V]",
    redteam_independence_flag: "[V]", redteam_judge_vs_human_result: "[V]",
  };
  if (status === "red") prov.released_evals = "[C]";
  const releasedOnInsert = status === "red" ? "LOW" : null;

  await withTx(async (cx) => {
    await cx.query(
      `insert into gov."Eval_Cell"(cohort_id, intent, version, status, n_golden_cases, kappa,
                                   redteam_independence_flag, redteam_judge_vs_human_result,
                                   released_evals, provenance_by_field)
       values ($1,$2,$3,$4::public.eval_status,$5,$6,$7,$8,$9::public.autonomy_level,$10::jsonb)
       on conflict (cohort_id, intent, version) do update set
         status                       = excluded.status,
         n_golden_cases            = excluded.n_golden_cases,
         kappa                        = excluded.kappa,
         redteam_independence_flag    = excluded.redteam_independence_flag,
         redteam_judge_vs_human_result= excluded.redteam_judge_vs_human_result,
         released_evals               = case when excluded.status='red'
                                             then 'LOW'::public.autonomy_level
                                             else gov."Eval_Cell".released_evals end,
         -- on red, the value is now auto-computed ([C]); strip a stale promote signature so the cell never
         -- claims a human signed the downgraded LOW. On green, leave a prior promotion's signature intact.
         provenance_by_field          = case when excluded.status='red'
                                             then (gov."Eval_Cell".provenance_by_field || excluded.provenance_by_field)
                                                  - 'released_evals_signed_by'
                                             else gov."Eval_Cell".provenance_by_field || excluded.provenance_by_field end`,
      [cohortId, intent, version, status, n, kappa, redteamIndependent,
       redteamIndependent ? "independent" : "co-biased", releasedOnInsert, JSON.stringify(prov)],
    );
  });

  return { cohortId, intent, version, n, passRate, kappa, redteamIndependent, status, downgraded: status === "red" };
}
