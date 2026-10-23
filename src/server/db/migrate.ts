import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { getPool } from "./pool";

const MIGRATION_LOCK_ID = 918_273_645;

export async function runMigrations(): Promise<string[]> {
  const directory = path.join(process.cwd(), "db", "migrations");
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const client = await getPool().connect();
  const applied: string[] = [];

  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    for (const file of files) {
      const existing = await client.query(
        "SELECT 1 FROM schema_migrations WHERE version = $1",
        [file],
      );
      if ((existing.rowCount ?? 0) > 0) continue;

      const sql = await readFile(path.join(directory, file), "utf8");

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1)",
          [file],
        );
        await client.query("COMMIT");
        applied.push(file);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]);
    } finally {
      client.release();
    }
  }

  return applied;
}
