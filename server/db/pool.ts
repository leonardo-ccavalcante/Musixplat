import pg from "pg";
import { env } from "../_core/env.js";

// Single pool. RLS Postgres policies are written but deferred (04 §13); the ACTIVE
// cross-pool enforcement is the server-side tRPC guard, which filters every query by the
// server-resolved tenant_id (never client-supplied). See queryForTenant.
// Remote Postgres (Supabase pooler in prod) requires TLS; local docker (127.0.0.1) does not.
const isLocalDb = /(\/\/|@)(127\.0\.0\.1|localhost)[:/]/.test(env.DATABASE_URL);
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  ssl: isLocalDb ? undefined : { rejectUnauthorized: false },
});

export type Sql = typeof pool;

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: readonly unknown[],
): Promise<T[]> {
  const res = await pool.query<T>(text, params as unknown[]);
  return res.rows;
}

// Run a unit of work in a transaction.
export async function withTx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

// Run a unit of work that is ALWAYS rolled back — ephemeral simulation, no-commit BY CONSTRUCTION
// (04 §14 sandbox: the what-if may reuse the real producers but must never persist). The caller
// reads results from `fn`'s return value before the rollback discards every write.
export async function withRollback<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    return await fn(client);
  } finally {
    await client.query("rollback");
    client.release();
  }
}
