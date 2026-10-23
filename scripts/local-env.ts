const LOCAL_DATABASE_URL =
  "postgres://one_invoice:one_invoice_dev@127.0.0.1:55432/one_invoice";

export function ensureLocalDatabaseUrl(): string {
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "DATABASE_URL is required in production. The local Docker default is never used there.",
      );
    }
    process.env.DATABASE_URL = LOCAL_DATABASE_URL;
    console.log("DATABASE_URL not set; using the local Docker Postgres default.");
  }
  return process.env.DATABASE_URL;
}
