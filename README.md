# One Invoice

**One invoice. One successful payment.**

A sandbox concept for Airwallex Track 3: an invoice-recovery workspace that
refuses to pay twice when the original transfer is uncertain, and only prepares
one replacement after a tested terminal failure and an exact human approval.

> **Status: durable backend layer; fixture-only UI.** This repository contains a
> transactional PostgreSQL schema, an exact-terms approval service, a single
> replacement slot, and an atomic dispatcher claim. The browser still reads
> synthetic fixtures only, and the mutation HTTP routes still return `501`. No
> Airwallex call, money movement, production database, operator authentication,
> or CSRF protection exists yet. It is not production banking software.
>
> Fixture-only production build:
> [one-invoice-eight.vercel.app](https://one-invoice-eight.vercel.app)
>
> Source:
> [github.com/vikassharma270907-alt/one-invoice](https://github.com/vikassharma270907-alt/one-invoice)

## What is implemented

- A fresh Next.js/TypeScript App Router project.
- One synthetic incident: `DEMO-INV-001`, USD 100.00, payee
  “Demo Design Studio”.
- A deterministic policy evaluator that blocks replacement while the original
  transfer is `SENT`, `PAID`, `UNKNOWN`, or a bare `CANCELLED`.
- A fixture-only failure path used by tests to prove that preparation is
  allowed only after an allowlisted failure. The replacement path exists as a
  database service, but no provider network call exists.
- A PostgreSQL 17 schema with durable obligations, incidents, evidence
  snapshots, approvals, transfer attempts, proposals, and an append-only audit
  trail.
- One active approval per incident, one original attempt and at most one
  replacement attempt per obligation, enforced by PostgreSQL constraints and
  partial unique indexes.
- Exact-terms approval creation: the server binds the incident, obligation,
  invoice, amount, currency, fee allowance, beneficiary, original request and
  transfer IDs, evidence version, and policy version into a SHA-256 hash.
- Transactional replacement preparation that consumes the approval and reserves
  the single replacement slot.
- An atomic dispatcher claim, claimant-only acknowledgement, unknown-outcome
  escalation, and a read-only reconciliation target. There is no automatic
  retry and no second payment attempt after a lost response.
- Integration tests for concurrent preparation, concurrent claims, expiry,
  stale evidence, duplicate request IDs, immutable bindings, append-only audit,
  and the one-active-approval rule.
- A deterministic fixture analyzer that extracts claims from untrusted supplier
  text and returns a strict structured schema. It is **not** a live model.
- A single incident workspace with five sections: incident header, supplier
  message, evidence, decision, and timeline.
- An approval panel that shows the exact terms but cannot issue an approval in
  this milestone.
- A separate demo-driver boundary with no funding, simulation, or
  failure-injection controls.
- Server-only configuration and redaction helpers.
- Schema validation, unit tests, linting, and type checking.

## What is intentionally absent

- No Airwallex client, authenticated balance read, beneficiary, transfer,
  simulation, or reconciliation call.
- No production database configuration, DB-backed UI, or DB connection in the
  deployed app. The durable services are currently exercised only by scripts and
  integration tests.
- No operator authentication or CSRF protection.
- No live model call.
- No approval or execution HTTP route. The durable services are not wired to the
  mutation endpoints, which still return HTTP 501.
- No background worker, queue, webhook consumer, or reconciliation job.
- No production secret store or live provider credentials.
- No BeyondFlow or ArmorIQ code.

The mutation endpoints exist only to make the boundary explicit:

```text
POST /api/incidents/[id]/refresh   -> 501 NOT_IMPLEMENTED
POST /api/incidents/[id]/prepare   -> 501 NOT_IMPLEMENTED
POST /api/incidents/[id]/approve   -> 501 NOT_IMPLEMENTED
POST /api/incidents/[id]/execute   -> 501 NOT_IMPLEMENTED
```

A disabled button is only a convenience. Server-side checks remain required
before any real payment path is added.

## Safety invariants

- The supplier message is labelled `UNTRUSTED` and is rendered as text, never
  as HTML.
- The analyzer output is schema-validated and cannot carry amount, beneficiary,
  request ID, or approval fields.
- The policy checks the trusted amount, currency, payee fingerprint, request ID,
  transfer ID, provider status, failure code, balance, and replacement slot.
- Trusted obligation terms, approval binding fields, and transfer-attempt
  bindings are immutable at the database layer. Audit events are append-only.
- At most one active approval per incident and at most one replacement attempt
  per obligation are enforced by PostgreSQL constraints and partial unique
  indexes.
- An approval is bound by a SHA-256 hash over the exact incident, obligation,
  invoice, amount, currency, fee allowance, beneficiary, original request and
  transfer IDs, evidence version, and policy version. The model cannot set any
  of those values or issue the approval.
- Preparation runs in a transaction: it re-evaluates policy, re-reads the
  approval, checks expiry and evidence/policy versions, consumes the approval,
  and reserves the replacement slot.
- A dispatcher claim is a conditional update from `PREPARED` to `DISPATCHING`.
  Only the current claimant may acknowledge or mark the operation unknown.
  A lost response becomes `UNKNOWN`; there is no automatic retry and no second
  payment attempt.
- A fixture-only failure code is used only for local tests. It is **not** an
  Airwallex allowlist.
- The app never claims exactly-once bank settlement.
- No live call is labelled as a fixture, and no fixture is labelled as live.

## Screens

### Incident workspace

The page at `/` shows:

1. Incident header with invoice, amount, trusted payee, app state, and data
   source.
2. Supplier message marked “UNTRUSTED SUPPLIER CONTENT”.
3. Evidence with provider status, balance, transfer/request IDs, failure code,
   and last evidence read.
4. Decision with allowed actions, blocked actions, backend reasons, the
   fixture analyzer proposal, and policy/evidence versions.
5. Timeline with append-only synthetic events.
6. Approval panel with exact terms and “no approval” state.
7. Separate operator-only demo-driver boundary.
8. Integration status showing `0 VERIFIED CALLS`.

### Fixture labels

The page permanently displays `SANDBOX`, `FIXTURE DATA`, and `NO LIVE CALLS`.
The fixture records `labels.dataSource = "fixture"` and
`labels.liveCalls = false`; the schema rejects a live-calls label in this
milestone.

## Architecture

```text
Browser
  -> Next.js server component (fixture + policy)
  -> read-only API routes
  -> pure policy evaluator
  -> deterministic fixture analyzer
  -> synthetic JSON fixture

Durable backend modules (currently exercised by scripts and tests)
  -> PostgreSQL 17
  -> exact-terms approvals
  -> transactional replacement preparation
  -> atomic dispatcher claim / acknowledgement / unknown state
  -> append-only audit trail

No provider adapter, DB-backed HTTP route, operator authentication, live model,
or network dispatch is connected in this milestone.
```

Key paths:

```text
src/app/page.tsx                         Incident workspace page
src/components/incident-workspace.tsx    Workspace UI
src/server/schemas/incident.ts           Zod schemas and types
src/server/policy/evaluate.ts            Deterministic policy
src/server/model/analyse-complaint.ts    Fixture-only analyzer
src/server/fixtures/incident.ts          Server-only fixture loader
src/server/config.ts                     Server-only env boundary
src/server/redaction.ts                  Best-effort model-input redaction
src/server/db/                           Pool, migrations, queries, mappers, seed
src/server/approvals/                    Exact-terms approval service and hashing
src/server/execution/dispatch.ts         Preparation, claim, ack, unknown state
src/server/domain/errors.ts              Domain error and PostgreSQL error helpers
db/migrations/001_initial.sql            Durable schema, constraints, triggers
scripts/migrate.ts                       Migration command
scripts/seed.ts                          Idempotent synthetic seed command
compose.yaml                             Local PostgreSQL 17 service
tests/integration/                       Database-backed integration tests
fixtures/synthetic/incident.json         Synthetic incident
docs/UNKNOWNS.md                         Integration unknowns
docs/sandbox-evidence/                   Empty evidence index
```

## Setup

Requires Node.js 20.9+ (tested with Node 24) and Docker Desktop for the local
PostgreSQL service.

```powershell
npm install
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
# open http://localhost:3000
```

`compose.yaml` runs PostgreSQL 17 on `127.0.0.1:55432` with development-only
credentials. Outside production, the migration, seed, and test scripts default
to that local URL when `DATABASE_URL` is unset. Set `DATABASE_URL` explicitly
for any other database. Do not reuse the local credentials in production.

```powershell
npm run db:down          # stop the container, keep data
docker compose down -v   # stop and delete local data
```

Copy `.env.example` to `.env.local` only when an authorised environment exists.
Do not put secrets in `NEXT_PUBLIC_*` variables. The deployed fixture-only UI
does not require a database connection.

## Checks

```powershell
npm run db:up
npm run db:test
npm run lint
npm run typecheck
npm test
npm run build
```

The suite contains 34 unit tests and 16 PostgreSQL integration tests. The
integration tests truncate and reseed the synthetic tables, so **never point
`DATABASE_URL` at a shared or production database when running tests**.
`npm test` and `npm run check` include the integration tests and therefore need
the local container running.

Coverage includes policy blocking, the fixture-only replaceable failure, balance
and identity mismatches, schema rejection of executable fields, hostile supplier
text, redaction, exact approval binding, approval expiry, stale evidence,
concurrent preparation, one active approval, duplicate request IDs, concurrent
dispatcher claims, and lost-response handling.

## Integration status

| Area | Status |
| --- | --- |
| UI and fixtures | Implemented; fixture-only Vercel deployment |
| Policy | Implemented for synthetic fixtures |
| Complaint analysis | Deterministic fixture analyzer only |
| PostgreSQL durable backend | Implemented and tested locally; production provider not configured |
| Database-backed HTTP routes | **Not implemented**; mutation routes return 501 |
| Authentication and CSRF | **Not implemented** |
| Approval and preparation services | Implemented at the service/DB layer; not wired to routes |
| Dispatcher network call | **Not implemented / UNCONFIRMED** |
| Airwallex API | **Not implemented / UNCONFIRMED** |
| Production database | **Not configured** |
| Live model | **Not implemented / UNCONFIRMED** |

See [docs/UNKNOWNS.md](docs/UNKNOWNS.md) for the full unknown list.

## Known dependency advisory

`npm audit` reports five high-severity advisories in the **dev-only** lint
toolchain: `eslint-config-next -> @next/eslint-plugin-next -> fast-glob ->
micromatch -> braces` (GHSA-vfj7-8cjw-p6xm). This is not part of the runtime
application. There is no non-breaking fix offered by npm; `npm audit fix
--force` would downgrade `eslint-config-next` to 14.2.35. Do not apply that
blindly. Recheck the advisory before release and record the decision.

## Next milestone

Before any provider call:

- choose and configure the production PostgreSQL provider, backup/PITR policy,
  pooling, migration ownership, and secret management;
- add operator authentication, CSRF protection, and incident ownership checks;
- wire DB-backed read, refresh, approve, prepare, and execute HTTP routes with
  server-side policy and approval checks;
- add a reconciliation worker or operator workflow for `UNKNOWN` outcomes;
- preserve the one-approval and one-replacement invariants in every route and
  worker path;
- test the complete browser-to-database flow, including unauthorised access,
  CSRF failure, replay, expiry, and stale evidence.

Only after that should the Airwallex adapter be added, and only with explicit
permission for each authorised sandbox test session. Every authenticated
Airwallex call remains **UNCONFIRMED** until it is actually run and recorded.

## Provenance

This is a fresh build. No BeyondFlow or ArmorIQ code, components, gateway, or
server is used. The synthetic names and values are invented fixtures, not real
financial records.

This project is separate from the earlier Mandate Track 2 prototype.
