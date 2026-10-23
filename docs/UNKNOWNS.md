# Integration unknowns

This file records what the foundation does **not** know. None of these items
may be treated as confirmed until an authorised sandbox call or an official
contract check produces evidence.

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

- [ ] Transactional PostgreSQL provider and connection pooling strategy.
- [ ] Migration tool and schema ownership.
- [ ] Operator authentication provider, session lifetime, and CSRF strategy.
- [ ] Ownership checks for incident access.
- [ ] Durable dispatcher claim mechanism and crash recovery.
- [ ] Reconciliation cadence and escalation ownership.
- [ ] Model provider, structured-output contract, and retry policy.
- [ ] Model evaluation set and repeated-run acceptance threshold.
- [ ] Deployment target and secret-management process.
- [ ] Event submission rules, exact deadline, and time zone.
- [ ] Dependency licence and organiser disclosure requirements.

## Explicit non-claims

- The app does **not** provide exactly-once bank settlement.
- A sandbox `PAID` status is not independent proof that a supplier received
  funds.
- A hash or database lock does not extend a transaction across Airwallex.
- A disabled button is not a security control; server-side checks are required.
- The fixture-only failure code is not an Airwallex allowlist.
