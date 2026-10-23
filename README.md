# One Invoice

**One invoice. One successful payment.**

A sandbox concept for Airwallex Track 3: an invoice-recovery workspace that
refuses to pay twice when the original transfer is uncertain, and only prepares
one replacement after a tested terminal failure and an exact human approval.

> **Status: foundation only.** This repository contains synthetic fixtures and a
> read-only incident workspace. It makes **no Airwallex calls**, performs **no
> money movement**, has **no database**, and has **no authentication**. It is
> not production banking software.

## What is implemented

- A fresh Next.js/TypeScript App Router project.
- One synthetic incident: `DEMO-INV-001`, USD 100.00, payee
  “Demo Design Studio”.
- A deterministic policy evaluator that blocks replacement while the original
  transfer is `SENT`, `PAID`, `UNKNOWN`, or a bare `CANCELLED`.
- A fixture-only failure path used by unit tests to prove that preparation is
  allowed only after an allowlisted failure and that execution remains blocked.
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

- No Airwallex client, authentication, balance read, beneficiary, transfer,
  simulation, or reconciliation call.
- No database or durable execution lock.
- No operator authentication or CSRF protection.
- No live model call.
- No approval or execution route. The mutation routes return HTTP 501.
- No deployment or hosted URL.
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

## Safety invariants in the foundation

- The supplier message is labelled `UNTRUSTED` and is rendered as text, never
  as HTML.
- The analyzer output is schema-validated and cannot carry amount, beneficiary,
  request ID, or approval fields.
- The policy checks the trusted amount, currency, payee fingerprint, request ID,
  transfer ID, provider status, failure code, balance, and replacement slot.
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

No provider adapter, database, model, approval service, or execution service
is connected in this milestone.
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
fixtures/synthetic/incident.json         Synthetic incident
tests/                                   Unit tests
docs/UNKNOWNS.md                         Integration unknowns
docs/sandbox-evidence/                   Empty evidence index
```

## Setup

Requires Node.js 20.9+; tested with Node 24.

```powershell
npm install
npm run dev
# open http://localhost:3000
```

Copy `.env.example` to `.env.local` only when an authorised environment exists.
Do not put secrets in `NEXT_PUBLIC_*` variables.

## Checks

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

The test suite covers policy blocking, the fixture-only replaceable failure,
balance and identity mismatches, schema rejection of executable fields, hostile
supplier text, and redaction.

## Integration status

| Area | Status |
| --- | --- |
| UI and fixtures | Implemented locally |
| Policy | Implemented for synthetic fixtures |
| Complaint analysis | Deterministic fixture analyzer only |
| Airwallex API | **Not implemented / UNCONFIRMED** |
| Database and durable lock | **Not implemented** |
| Authentication and CSRF | **Not implemented** |
| Approval and execution | **Not implemented** |
| Deployment | Not created |
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

Before any provider call, implement the durable records and invariants:

- transactional PostgreSQL schema and migrations;
- unique original/replacement slot;
- approval binding to exact terms, evidence version, and policy version;
- atomic dispatcher claim and unknown-outcome handling;
- operator authentication and CSRF protection;
- tests for concurrent execution, lost responses, stale evidence, and replay.

Only after that should the Airwallex adapter be added, and only with explicit
permission for each authorised sandbox test session.

## Provenance

This is a fresh build. No BeyondFlow or ArmorIQ code, components, gateway, or
server is used. The synthetic names and values are invented fixtures, not real
financial records.

This project is separate from the earlier Mandate Track 2 prototype.
