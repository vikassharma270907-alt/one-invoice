import { Pool, types, type PoolClient } from "pg";

// Minor units are stored as bigint. The application caps them well below
// Number.MAX_SAFE_INTEGER, so converting int8 to a number here is safe.
types.setTypeParser(20, (value: string) => Number(value));

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is required for the durable backend. Set it server-side; never expose it to the browser.",
      );
    }

    pool = new Pool({
      connectionString,
      application_name: "one-invoice",
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  return pool;
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  const current = pool;
  pool = undefined;
  await current.end();
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original error. The connection may already be broken.
    }
    throw error;
  } finally {
    client.release();
  }
}
