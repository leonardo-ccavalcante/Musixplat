import { query } from "../db/pool.js";
import type { TokenUsage } from "./llm.js";

// The business processes whose token cost we separate ("custo da atención"). Derived from the real
// LLM call-sites (chat: diagnosis/kb_ingest/kb_ask; embedding: kb_ingest/kb_search/nba_kb_check).
// Extend here as new agents are wired — the cost view groups by this column.
export type ProcessType =
  | "diagnosis"
  | "kb_ingest"
  | "kb_ask"
  | "kb_search"
  | "nba_kb_check"
  | "motor" // 02C — autonomous NBA hypothesis loop (token cost per decision)
  | "cockpit"; // 02:1a — restaurant-facing copy for an NBA proposal (the owner-message agent)

// Which price family the model is billed under — picks the Config_Knobs price knob (chat has in+out,
// embedding has input only). NEVER infer cost here: this layer only records the raw provider COUNTS.
export type LlmKind = "chat" | "embedding";

export interface UsageEntry {
  tenantId: string;
  processType: ProcessType;
  kind: LlmKind;
  model: string;
  refId?: string | null; // the unit of attention: episode_id / problem_id / doc_id / nba_id
  usage: TokenUsage;
}

// Injectable executor (the pool's `query`) so the unit test runs with no DB.
export type Exec = (sql: string, params: readonly unknown[]) => Promise<unknown>;

/** Persist ONE usage row. The COST is computed downstream in SQL from Config_Knobs prices (§3.6/§14) —
 *  this only stores the token COUNTS reported by the provider + the process context to group by. */
export async function recordUsage(entry: UsageEntry, exec: Exec = query): Promise<void> {
  await exec(
    `insert into gov."Llm_Usage_Log"(tenant_id, process_type, kind, model, ref_id, in_tok, out_tok)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [
      entry.tenantId,
      entry.processType,
      entry.kind,
      entry.model,
      entry.refId ?? null,
      entry.usage.inputTokens,
      entry.usage.outputTokens,
    ],
  );
}

/** Best-effort variant for hot paths: a telemetry write must never fail the user's request (answering
 *  a ticket > logging its cost). Swallows + warns; the missing row is the only consequence. */
export async function recordUsageSafe(entry: UsageEntry, exec: Exec = query): Promise<void> {
  try {
    await recordUsage(entry, exec);
  } catch (e) {
    console.warn(`recordUsage failed (${entry.processType}/${entry.kind}):`, e);
  }
}
