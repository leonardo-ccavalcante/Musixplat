import pg from "pg";
import { env } from "../_core/env.js";

// Single pool. RLS Postgres policies are written but deferred (04 §13); the ACTIVE
// cross-pool enforcement is the server-side tRPC guard, which filters every query by the
// server-resolved tenant_id (never client-supplied). See queryForTenant.
export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });

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
