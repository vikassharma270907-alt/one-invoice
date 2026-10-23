import { closePool } from "../src/server/db/pool";
import { runMigrations } from "../src/server/db/migrate";
import { ensureLocalDatabaseUrl } from "./local-env";

async function main(): Promise<void> {
  ensureLocalDatabaseUrl();
  const applied = await runMigrations();
  console.log(
    applied.length > 0
      ? `Applied migrations: ${applied.join(", ")}`
      : "No pending migrations.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
