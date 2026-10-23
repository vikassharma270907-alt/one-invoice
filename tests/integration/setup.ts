const LOCAL_DATABASE_URL =
  "postgres://one_invoice:one_invoice_dev@127.0.0.1:55432/one_invoice";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = LOCAL_DATABASE_URL;
}
