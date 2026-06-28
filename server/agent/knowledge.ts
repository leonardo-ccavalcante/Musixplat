import type pg from "pg";

// The chat's learning contribution: a resolved/handled conversation becomes a Knowledge_Case so (a) it
// surfaces in the human RLHF review queue (reviewed=false) and (b) once reviewed it grounds future
// diagnoses (BR-B3). §14-honest: we record the PATTERN ([C] text, already PII-redacted), area_type, and
// leave `outcome` NULL — the conversation did not MEASURE a resolution, so we never claim one.

type Exec = <T extends pg.QueryResultRow>(sql: string, params: readonly unknown[]) => Promise<T[]>;

export async function writeChatCase(
  exec: Exec,
  tenantId: string,
  areaType: string,
  pattern: string,
): Promise<void> {
  await exec(
    `insert into tenant."Knowledge_Case"(tenant_id, area_type, pattern, reviewed, provenance_by_field)
       values ($1, $2, $3, false, jsonb_build_object('pattern', '[C]'))`,
    [tenantId, areaType, pattern],
  );
}
