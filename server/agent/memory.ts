import type pg from "pg";
import { redactPII } from "../pieces/pii.js";
import type { Turn } from "./chat.js";

// Conversation memory in the LangChain Postgres-Chat-Memory column shape (session_id + message jsonb),
// in the gov schema (NOT public, so the Supabase Data API never exposes it). The platform writes `content`
// ALREADY REDACTED — the B2B owner case must never persist raw PII.

type Exec = <T extends pg.QueryResultRow>(sql: string, params: readonly unknown[]) => Promise<T[]>;

export async function loadHistory(exec: Exec, sessionId: string, limit = 10): Promise<Turn[]> {
  const r = await exec<{ message: { type?: string; content?: string } }>(
    `select message from gov.n8n_chat_histories
       where session_id = $1 order by sequence_number desc limit $2`,
    [sessionId, limit],
  );
  // newest-first from SQL → reverse to chronological for the prompt. Defence-in-depth: re-redact each
  // stored line before it reaches the LLM, so even a legacy/foreign row that holds raw PII can't leak.
  return r
    .map((x) => ({
      role: (x.message.type === "ai" ? "ai" : "human") as Turn["role"],
      content: redactPII(String(x.message.content ?? "")).texto,
    }))
    .reverse();
}

/** Append the human + ai turn (both already redacted). Sequence is per-session max+1; a single owner's
 *  turns are serial, so the read-then-write is safe enough for Fatia 1 (no concurrent same-session writes).
 *  tenant_id is best-effort (null on pre-bind onboarding turns) for future tenant-scoped RLS. */
export async function appendTurn(
  exec: Exec,
  sessionId: string,
  human: string,
  ai: string,
  tenantId: string | null = null,
): Promise<void> {
  const base = await exec<{ n: number }>(
    `select coalesce(max(sequence_number), 0)::int as n from gov.n8n_chat_histories where session_id = $1`,
    [sessionId],
  );
  const start = base[0]?.n ?? 0;
  await exec(
    `insert into gov.n8n_chat_histories(session_id, tenant_id, message, sequence_number) values
       ($1, $2, jsonb_build_object('type','human','content',$3::text), $4),
       ($1, $2, jsonb_build_object('type','ai','content',$5::text), $6)`,
    [sessionId, tenantId, human, start + 1, ai, start + 2],
  );
}
