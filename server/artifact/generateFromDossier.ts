import { query } from "../db/pool.js";
import { readDossier } from "../diagnosis/dossier.js";
import type { GenerateArtifactResult } from "../../shared/contracts_05c.js";

// 05C EPIC-C1/C3a — turn a COMPLETE dossier into a PERSISTED, metric-bound artifact. Fail-closed:
//   - incomplete dossier      ⇒ 'incomplete_dossier' + gaps (no row);
//   - missing HOW (no KB res.) ⇒ 'missing_how' (BR-C1-6: C NEVER invents the HOW, escalate to create it).
// content is a DETERMINISTIC render of the dossier's produced fields + the KB HOW — no LLM, no fabricated
// number (§3.6/§14). Finance is impact-only by construction (no money-moving artifact type, BR-C1-7).
// target_metric is bound at creation (BR-C1-3). Idempotent per (problem, type).

// Metric-binding catalogue (BR-C1-3): the objective each artifact is accountable to, by problem area.
const METRIC_BY_AREA: Record<string, string> = {
  finance: "recover_failed_payment_value",
  product: "recover_feature_adoption",
  performance: "restore_connection_window",
};

export async function generateFromDossier(problemId: string, tenantId: string): Promise<GenerateArtifactResult> {
  const dossier = await readDossier(problemId);
  // Fail-closed: a half-done dossier never becomes an artifact (BR-B17/B18, BR-C1).
  if (!dossier.emitted || !dossier.fields) {
    return { status: "incomplete_dossier", gaps: dossier.gaps };
  }
  const f = dossier.fields;

  // BR-C1-6 — the HOW must come from a Knowledge_Case resolution; absent ⇒ fail-closed (escalate to create it).
  const how = await query<{ resolution: string }>(
    `select kc.resolution
       from tenant."Diagnosed_Problem" p
       join tenant."Knowledge_Case" kc on kc.tenant_id = p.tenant_id and kc.area_type = p.area_type
      where p.problem_id = $1 and p.tenant_id = $2 and kc.resolution is not null
      limit 1`,
    [problemId, tenantId],
  );
  if (!how[0]) return { status: "missing_how" };

  const proposer = (
    await query<{ user_id: string }>(
      `select user_id from gov."User"
        where tenant_id = $1 and role = 'ai_agent' order by user_id limit 1`,
      [tenantId],
    )
  )[0];
  if (!proposer) throw new Error("generateFromDossier: no AI proposer for pool (fail-closed)");

  const area = String((f.f1_tipo_raiz as Record<string, unknown> | null)?.area_type ?? "unknown");
  const targetMetric = METRIC_BY_AREA[area] ?? `improve_${area}`;
  // Deterministic render — quotes the dossier's PRODUCED fields + the KB HOW. Never invents a number.
  const content = {
    kind: "internal_email",
    subject: `Action — ${area} issue, concentrated ${JSON.stringify(f.f4_where_concentrated)}`,
    body: {
      root: f.f8_auditable_hypothesis,
      who_affected: f.f3_who,
      impact: f.f5_how_much,
      how: how[0].resolution, // reproducible HOW from the KB precedent (not invented)
      route: f.f9_suggested_route,
    },
  };

  const ins = await query<{ artifact_id: string }>(
    `insert into gov."Generated_Artifact" as ga
       (tenant_id, problem_id, artifact_type, target_metric, dossier_ref, content, provenance, proposer_id)
     values ($1, $2, 'email_content', $3, $4::jsonb, $5::jsonb, $6::jsonb, $7)
     on conflict (problem_id, artifact_type)
       do update set target_metric = excluded.target_metric,
                     dossier_ref = excluded.dossier_ref,
                     content = excluded.content,
                     provenance = excluded.provenance,
                     proposer_id = excluded.proposer_id,
                     updated_at = now()
       where ga.status = 'pending_review' and ga.decision_trace_id is null and ga.superseded_at is null
     returning artifact_id::text as artifact_id`,
    [
      tenantId,
      problemId,
      targetMetric,
      JSON.stringify(f),
      JSON.stringify(content),
      JSON.stringify(f.f11_provenance ?? {}),
      proposer.user_id,
    ],
  );
  if (!ins[0]) {
    const locked = (
      await query<{ artifact_id: string }>(
        `select artifact_id::text as artifact_id from gov."Generated_Artifact"
          where tenant_id=$1 and problem_id=$2 and artifact_type='email_content'`,
        [tenantId, problemId],
      )
    )[0];
    if (!locked) throw new Error("generateFromDossier: conflict row disappeared");
    return { status: "locked", artifact_id: locked.artifact_id };
  }
  return { status: "generated", artifact_id: ins[0]!.artifact_id, artifact_type: "email_content", target_metric: targetMetric };
}
