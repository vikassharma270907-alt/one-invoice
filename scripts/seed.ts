import { closePool, withTransaction } from "../src/server/db/pool";
import { seedDemoIncident } from "../src/server/db/seed";
import { ensureLocalDatabaseUrl } from "./local-env";

async function main(): Promise<void> {
  ensureLocalDatabaseUrl();
  const result = await withTransaction((client) => seedDemoIncident(client));
  console.log("Seeded synthetic incident:", result);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
