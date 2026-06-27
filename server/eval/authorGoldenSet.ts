// Part 1 (eval coach loop): the OPERATOR authors their OWN golden set — for real cohort members, the right
// call (correct_label A1–A8) = "what good looks like". Sibling of seedGoldenSet (which auto-authors a DEMO
// from the motor's own answer); here the gabarito is the HUMAN's attested label, so the eval has real weight.
// §14: writes ONLY INPUT (Eval_Set + Eval_Case + Eval_Judge_Label); the Eval_Cell VERDICT is still PRODUCED
// by runEval. Atomic + idempotent (re-authoring the same version is a no-op — never a duplicate or a partial
// set that the idempotency guard would later treat as complete).
import { withTx } from "../db/pool.js";

export interface AuthoredCase {
  restaurantId: string;
  correctLabel: string; // the operator's call: A1..A8
}

const isLabel = (s: string): boolean => /^A[1-8]$/.test(s);

/** Write a human-authored golden set for (cohort × intent × version). 3 unanimous judges per case = the
 *  author's attestation (a reliable key ⇒ Fleiss κ = 1.0); the AI is never a judge (redteam independence
 *  holds). Returns how many cases were authored (0 ⇒ nothing valid, or already authored). INPUT [V] only —
 *  no verdict is written here (that is runEval's job, §14). */
export async function authorGoldenSet(input: {
  tenantId: string;
  cohortId: string;
  intent: string;
  version: string;
  targetLevel: "LOW" | "MEDIUM" | "HIGH";
  week: string;
  cases: AuthoredCase[];
  authorId: string;
}): Promise<{ version: string; n: number }> {
  const valid = input.cases.filter((c) => c.restaurantId && isLabel(c.correctLabel));
  if (valid.length === 0) return { version: input.version, n: 0 };

  return withTx(async (cx) => {
    // Reusing an existing version with a DIFFERENT target_level would silently keep the old certification
    // (on conflict do nothing) while the UI promotes to the new one — promote then raises to the wrong level.
    // Fail-closed: a version name certifies exactly one level (§14 evidence integrity).
    const prior = await cx.query<{ target_level: string }>(`select target_level from gov."Eval_Set" where version=$1`, [input.version]);
    if (prior.rows[0] && prior.rows[0].target_level !== input.targetLevel) {
      throw new Error(`version '${input.version}' already certifies ${prior.rows[0].target_level} — choose a new version name`);
    }
    await cx.query(
      `insert into gov."Eval_Set"(version,target_level,description)
       values ($1,$2::public.autonomy_level,$3) on conflict (version) do nothing`,
      [input.version, input.targetLevel, `operator-authored golden set (by ${input.authorId})`],
    );
    // pool-aware idempotency (§3.4): Eval_Case has no tenant_id and a cohort spans pools, so anchor on the
    // scenario restaurant's owner. Cases already authored by US ⇒ idempotent no-op (no duplicate/half-write).
    // Cases under this version owned by ANOTHER pool ⇒ reject — a version is single-pool, so runEval/promote
    // never grade or raise on another tenant's evidence.
    const ex = await cx.query<{ in_pool: boolean | null }>(
      `select bool_or(r.tenant_id = $4) as in_pool from gov."Eval_Case" ec
         left join tenant."Restaurant" r on r.restaurant_id = (ec.scenario->>'restaurant_id')
        where ec.cohort_id = $1 and ec.intent = $2 and ec.version = $3`,
      [input.cohortId, input.intent, input.version, input.tenantId],
    );
    const inPool = ex.rows[0]?.in_pool ?? null;
    if (inPool === true) return { version: input.version, n: 0 };
    if (inPool === false) throw new Error(`version '${input.version}' is already used by another pool — choose a new version name`);

    let n = 0;
    for (const c of valid) {
      const scenario = JSON.stringify({ restaurant_id: c.restaurantId, week: input.week });
      const cid = (
        await cx.query<{ eval_case_id: string }>(
          `insert into gov."Eval_Case"(cohort_id,intent,version,scenario,correct_label)
           values ($1,$2,$3,$4::jsonb,$5) returning eval_case_id`,
          [input.cohortId, input.intent, input.version, scenario, c.correctLabel],
        )
      ).rows[0]!.eval_case_id;
      for (let j = 1; j <= 3; j++) {
        await cx.query(`insert into gov."Eval_Judge_Label"(eval_case_id,judge_id,label) values ($1,$2,$3)`, [
          cid,
          `U-J${j}`,
          c.correctLabel,
        ]);
      }
      n++;
    }
    return { version: input.version, n };
  });
}
