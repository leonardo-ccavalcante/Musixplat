import { TRPCError } from "@trpc/server";
import { query } from "../db/pool.js";

// F-4.3 — shared anti-mix guard (CLAUDE.md §3.5). fail-closed: a read that would mix
// baselines of different cohort_rule_version is blocked + logged. Reused by every selector,
// never duplicated per screen.
export async function assertSingleVersion(
  tenantId: string | null,
  versions: ReadonlyArray<string | null>,
): Promise<void> {
  const distinct = new Set(versions.filter((v): v is string => !!v));
  if (distinct.size > 1) {
    await query(`insert into gov."Security_Log"(tenant_id, kind, detail) values ($1,'version_mix',$2)`, [
      tenantId,
      JSON.stringify({ versions: [...distinct] }),
    ]);
    throw new TRPCError({ code: "CONFLICT", message: "anti-mix: mixed cohort_rule_version blocked" });
  }
}
