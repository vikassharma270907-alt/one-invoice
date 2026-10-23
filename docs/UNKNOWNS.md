# Integration unknowns

This file records what the foundation does **not** know. None of these items
may be treated as confirmed until an authorised sandbox call or an official
contract check produces evidence.

## Local durable backend (verified locally, not production-confirmed)

- [x] PostgreSQL 17 via Docker Compose on `127.0.0.1:55432` for development.
- [x] Raw SQL migration `db/migrations/001_initial.sql`, applied by
      `scripts/migrate.ts`.
- [x] Idempotent synthetic seed for `INC-DEMO-001`.
- [x] One active approval per incident via a partial unique index.
- [x] One original and at most one replacement attempt per obligation.
- [x] Immutable obligation terms, approval bindings, and attempt bindings via
      database triggers.
- [x] Append-only audit events via a database trigger.
- [x] Transactional preparation that rechecks policy, expiry, evidence version,
      policy version, and exact terms before consuming the approval.
- [x] Atomic conditional dispatcher claim; only the claimant can acknowledge or
      mark the operation unknown.
- [x] Lost response becomes `UNKNOWN`, escalates the incident, and does not
      create a second replacement.
- [x] 16 integration tests against the local database.

What this does **not** establish:

- [ ] A production PostgreSQL provider, backups, point-in-time recovery,
      connection limits, or failover.
- [ ] Production migration ownership and deployment procedure.
- [ ] Tenant/ownership enforcement for incident access.
- [ ] Operator authentication, session management, or CSRF protection.
- [ ] DB-backed HTTP routes or any connection from the deployed app to a DB.
- [ ] A real dispatcher network call, webhook consumer, queue, or reconciliation
      worker.
- [ ] Crash recovery for a process that dies after claiming but before writing
      an acknowledgement or unknown state.
- [ ] Exactly-once bank settlement.

## Airwallex runtime and contract

- [ ] Sandbox account access, permissions, and test-funding availability.
- [ ] Authentication request/response shape, token lifetime, and refresh rules.
- [ ] Exact sandbox API host, API version headers, and `/api/v1` prefix.
- [ ] `GET /balances/current` account selection and the difference between
      total and available balances.
- [ ] Beneficiary schema fields for the chosen US/USD/LOCAL setup.
- [ ] `POST /beneficiaries/create` required fields and idempotency behaviour.
- [ ] `POST /transfers/create` exact payload fields, amount units, and how the
      request ID is supplied.
- [ ] `GET /transfers` request-ID filter shape and the seven-day duplicate
      window behaviour.
- [ ] Which provider status values are terminal, and what each one means.
- [ ] Which failure codes/reasons are safely replaceable.
- [ ] `POST /simulation/transfers/{id}/transition` supported transitions,
      required fields, and version compatibility.
- [ ] Balance and fee behaviour after a failed transfer.
- [ ] Whether polling or webhooks are available and reliable in the sandbox.
- [ ] Behaviour when a create response is lost or times out.
- [ ] Whether a duplicate request ID returns the original transfer or an error.

## Application and infrastructure

- [ ] Production transactional PostgreSQL provider and connection pooling
      strategy. Local Docker is verified only for development and tests.
- [ ] Production migration ownership, backup/restore, and point-in-time
      recovery.
- [ ] Operator authentication provider, session lifetime, and CSRF strategy.
- [ ] Ownership checks for incident access.
- [ ] Dispatcher crash recovery and reconciliation cadence. The local claim and
      `UNKNOWN` transition are implemented; no worker consumes them.
- [ ] Reconciliation ownership and escalation contact.
- [ ] Model provider, structured-output contract, and retry policy.
- [ ] Model evaluation set and repeated-run acceptance threshold.
- [ ] Production deployment secrets and secret-management process. The Vercel
      deployment is fixture-only and has no database connection.
- [ ] Event submission rules, exact deadline, and time zone.
- [ ] Dependency licence and organiser disclosure requirements.

## Explicit non-claims

- The app does **not** provide exactly-once bank settlement.
- A sandbox `PAID` status is not independent proof that a supplier received
  funds.
- A hash or database lock does not extend a transaction across Airwallex.
- A disabled button is not a security control; server-side checks are required.
- The fixture-only failure code is not an Airwallex allowlist.
