import { randomUUID } from "node:crypto";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  buildApprovalTerms,
  hashApprovalTerms,
  hashPayload,
} from "@/server/approvals/terms";
import { createApproval } from "@/server/approvals/service";
import { runMigrations } from "@/server/db/migrate";
import { closePool, withTransaction } from "@/server/db/pool";
import { loadPolicyContext } from "@/server/db/queries";
import { seedDemoIncident } from "@/server/db/seed";
import { DomainError } from "@/server/domain/errors";
import {
  claimPreparedOperation,
  getReconciliationTarget,
  markDispatchAcknowledged,
  markDispatchUnknown,
  prepareReplacement,
} from "@/server/execution/dispatch";
import {
  evaluatePolicyFacts,
} from "@/server/policy/evaluate";

const INCIDENT_ID = "INC-DEMO-001";
const OBLIGATION_ID = "OBL-DEMO-001";
const APPROVER = "operator@example.test";
const BENEFICIARY_FINGERPRINT = "demo:ben:8f3a:c21";

async function queryOne<T>(
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  return withTransaction(async (client) => {
    const result = await client.query(sql, params);
    return result.rows[0] as T;
  });
}

async function queryCount(
  sql: string,
  params: unknown[] = [],
): Promise<number> {
  const row = await queryOne<{ count: number }>(sql, params);
  return row.count;
}

async function addFailedEvidence(options: {
  id: string;
  fetchedAt: Date;
}): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO evidence_snapshots
         (id, incident_id, source, refresh_status, fetched_at, provider_status,
          provider_transfer_id, provider_request_id, available_balance_minor,
          currency, beneficiary_fingerprint, amount_minor, failure_code,
          failure_detail, values_hash, error_detail)
       VALUES ($1, $2, 'sandbox', 'SUCCESS', $3, 'FAILED', $4, $5, 25000,
               'USD', $6, 10000, 'DEMO_SYNTHETIC_FAILURE',
               'Synthetic integration-test failure.', $7, NULL)`,
      [
        options.id,
        INCIDENT_ID,
        options.fetchedAt,
        "tr_demo_original_001",
        "req_demo_original_001",
        BENEFICIARY_FINGERPRINT,
        hashPayload({
          id: options.id,
          fetchedAt: options.fetchedAt.toISOString(),
          failureCode: "DEMO_SYNTHETIC_FAILURE",
        }),
      ],
    );
  });
}

async function addFailedRefreshEvidence(): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO evidence_snapshots
         (id, incident_id, source, refresh_status, fetched_at, provider_status,
          provider_transfer_id, provider_request_id, available_balance_minor,
          currency, beneficiary_fingerprint, amount_minor, failure_code,
          failure_detail, values_hash, error_detail)
       VALUES ($1, $2, 'sandbox', 'FAILED', $3, NULL, NULL, NULL, NULL, NULL,
               NULL, NULL, NULL, NULL, $4, 'Provider lookup timed out.')`,
      [
        "EVD-DEMO-REFRESH-FAILED",
        INCIDENT_ID,
        new Date(Date.now() + 500),
        hashPayload({ error: "timeout" }),
      ],
    );
  });
}

async function createReplaceableApproval(options: {
  now?: Date;
  evidenceId?: string;
  fetchedAt?: Date;
} = {}) {
  await addFailedEvidence({
    id: options.evidenceId ?? `EVD-DEMO-FAILED-${randomUUID()}`,
    fetchedAt: options.fetchedAt ?? new Date(Date.now() + 1_000),
  });

  return createApproval({
    incidentId: INCIDENT_ID,
    approver: APPROVER,
    now: options.now,
  });
}

// Synthetic application payload, not an Airwallex request body. The provider
// payload will be built only after reading the official endpoint schemas.
function prepareInput(approvalId: string, suffix: string) {
  const requestId = `req_demo_replacement_${suffix}`;
  return {
    incidentId: INCIDENT_ID,
    approvalId,
    operationId: `ATT-DEMO-REP-${suffix}`,
    requestId,
    payload: {
      applicationOperation: "REPLACEMENT",
      requestId,
      amountMinor: 10000,
      currency: "USD",
      beneficiaryFingerprint: BENEFICIARY_FINGERPRINT,
    },
    actor: APPROVER,
  };
}

beforeAll(async () => {
  await runMigrations();
});

beforeEach(async () => {
  await withTransaction(async (client) => {
    await client.query(
      `TRUNCATE TABLE audit_events, transfer_attempts, approvals, proposals,
         evidence_snapshots, incidents, obligations
       RESTART IDENTITY CASCADE`,
    );
    await seedDemoIncident(client);
  });
});

afterAll(async () => {
  await closePool();
});

describe("durable replacement backend", () => {
  it("blocks approval while the original transfer is SENT", async () => {
    await expect(
      createApproval({ incidentId: INCIDENT_ID, approver: APPROVER }),
    ).rejects.toMatchObject({ code: "POLICY_BLOCKS_APPROVAL" });

    const incident = await queryOne<{ app_state: string }>(
      "SELECT app_state FROM incidents WHERE id = $1",
      [INCIDENT_ID],
    );
    expect(incident.app_state).toBe("ORIGINAL_SENT");

    const auditCount = await queryCount(
      "SELECT count(*)::int AS count FROM audit_events WHERE event_type = 'APPROVAL_BLOCKED'",
    );
    expect(auditCount).toBe(1);
  });

  it("creates an approval bound to the current exact terms", async () => {
    await addFailedEvidence({
      id: "EVD-DEMO-FAILED",
      fetchedAt: new Date(Date.now() + 1_000),
    });

    const approval = await createApproval({
      incidentId: INCIDENT_ID,
      approver: APPROVER,
    });

    expect(approval.state).toBe("RESERVED");
    expect(approval.termsHash).toMatch(/^[a-f0-9]{64}$/);

    const context = await withTransaction((client) =>
      loadPolicyContext(client, INCIDENT_ID),
    );
    const decision = evaluatePolicyFacts(context.facts);
    const expectedTerms = buildApprovalTerms({
      incident: context.incident,
      obligation: context.obligation,
      facts: context.facts,
      decision,
    });

    expect(approval.termsHash).toBe(hashApprovalTerms(expectedTerms));
    expect(approval.evidenceVersion).toBe("EVD-DEMO-FAILED");
    expect(approval.policyVersion).toBe(decision.policyVersion);

    const incident = await queryOne<{ app_state: string }>(
      "SELECT app_state FROM incidents WHERE id = $1",
      [INCIDENT_ID],
    );
    expect(incident.app_state).toBe("FAILURE_CONFIRMED_REPLACEABLE");
  });

  it("allows only one active approval per incident", async () => {
    await addFailedEvidence({
      id: "EVD-DEMO-FAILED",
      fetchedAt: new Date(Date.now() + 1_000),
    });

    const results = await Promise.allSettled([
      createApproval({ incidentId: INCIDENT_ID, approver: "approver-a" }),
      createApproval({ incidentId: INCIDENT_ID, approver: "approver-b" }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(
      1,
    );

    const rejected = results.find(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected",
    );
    expect(rejected?.reason).toBeInstanceOf(DomainError);
    expect((rejected?.reason as DomainError).code).toBe(
      "ACTIVE_APPROVAL_EXISTS",
    );

    const activeCount = await queryCount(
      "SELECT count(*)::int AS count FROM approvals WHERE incident_id = $1 AND state IN ('RESERVED', 'CONSUMED')",
      [INCIDENT_ID],
    );
    expect(activeCount).toBe(1);
  });

  it("rejects an expired approval and records the expiry", async () => {
    const past = new Date(Date.now() - 10 * 60 * 1000);
    const approval = await createReplaceableApproval({ now: past });

    await expect(
      prepareReplacement(prepareInput(approval.id, "expired")),
    ).rejects.toMatchObject({ code: "APPROVAL_EXPIRED" });

    const row = await queryOne<{ state: string }>(
      "SELECT state FROM approvals WHERE id = $1",
      [approval.id],
    );
    expect(row.state).toBe("EXPIRED");

    const replacementCount = await queryCount(
      "SELECT count(*)::int AS count FROM transfer_attempts WHERE obligation_id = $1 AND kind = 'REPLACEMENT'",
      [OBLIGATION_ID],
    );
    expect(replacementCount).toBe(0);
  });

  it("revokes an approval when evidence changes after approval", async () => {
    const approval = await createReplaceableApproval();
    await addFailedEvidence({
      id: "EVD-DEMO-FAILED-NEWER",
      fetchedAt: new Date(Date.now() + 5_000),
    });

    await expect(
      prepareReplacement(prepareInput(approval.id, "stale")),
    ).rejects.toMatchObject({ code: "APPROVAL_STALE" });

    const row = await queryOne<{ state: string }>(
      "SELECT state FROM approvals WHERE id = $1",
      [approval.id],
    );
    expect(row.state).toBe("REVOKED");

    const incident = await queryOne<{ app_state: string }>(
      "SELECT app_state FROM incidents WHERE id = $1",
      [INCIDENT_ID],
    );
    expect(incident.app_state).toBe("ESCALATED");
  });

  it("rejects an approval whose terms hash does not match the current terms", async () => {
    await addFailedEvidence({
      id: "EVD-DEMO-FAILED",
      fetchedAt: new Date(Date.now() + 1_000),
    });

    const context = await withTransaction((client) =>
      loadPolicyContext(client, INCIDENT_ID),
    );
    const decision = evaluatePolicyFacts(context.facts);
    const terms = buildApprovalTerms({
      incident: context.incident,
      obligation: context.obligation,
      facts: context.facts,
      decision,
    });

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO approvals
           (id, incident_id, approver, terms_hash, terms, evidence_version,
            policy_version, expires_at, state, reserved_at, consumed_at)
         VALUES ('apr_tampered', $1, $2, 'not-the-current-terms-hash', $3::jsonb,
                 $4, $5, now() + interval '5 minutes', 'RESERVED', now(), NULL)`,
        [
          INCIDENT_ID,
          APPROVER,
          JSON.stringify(terms),
          decision.evidenceVersion,
          decision.policyVersion,
        ],
      );
    });

    await expect(
      prepareReplacement(prepareInput("apr_tampered", "tampered")),
    ).rejects.toMatchObject({ code: "APPROVAL_TERMS_MISMATCH" });

    const row = await queryOne<{ state: string }>(
      "SELECT state FROM approvals WHERE id = 'apr_tampered'",
    );
    expect(row.state).toBe("REVOKED");
  });

  it("keeps trusted obligation terms immutable at the database layer", async () => {
    await expect(
      withTransaction((client) =>
        client.query(
          "UPDATE obligations SET amount_minor = 99999 WHERE id = $1",
          [OBLIGATION_ID],
        ),
      ),
    ).rejects.toThrow(/trusted obligation terms are immutable/);
  });

  it("keeps an approval's binding fields immutable at the database layer", async () => {
    const approval = await createReplaceableApproval();

    await expect(
      withTransaction((client) =>
        client.query(
          "UPDATE approvals SET terms_hash = 'tampered' WHERE id = $1",
          [approval.id],
        ),
      ),
    ).rejects.toThrow(/approval binding is immutable/);
  });

  it("prepares exactly one replacement and consumes the approval", async () => {
    const approval = await createReplaceableApproval();
    const input = prepareInput(approval.id, "one");
    const attempt = await prepareReplacement(input);

    expect(attempt.kind).toBe("REPLACEMENT");
    expect(attempt.dispatchState).toBe("PREPARED");
    expect(attempt.requestId).toBe(input.requestId);
    expect(attempt.approvalId).toBe(approval.id);
    expect(attempt.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(attempt.claimedBy).toBeNull();

    const approvalRow = await queryOne<{ state: string }>(
      "SELECT state FROM approvals WHERE id = $1",
      [approval.id],
    );
    expect(approvalRow.state).toBe("CONSUMED");

    const incident = await queryOne<{ app_state: string }>(
      "SELECT app_state FROM incidents WHERE id = $1",
      [INCIDENT_ID],
    );
    expect(incident.app_state).toBe("REPLACEMENT_PREPARED");
  });

  it("rejects a duplicate request ID without consuming the approval", async () => {
    const approval = await createReplaceableApproval();
    const duplicate = prepareInput(approval.id, "duplicate");
    duplicate.requestId = "req_demo_original_001";
    duplicate.payload.requestId = "req_demo_original_001";

    await expect(prepareReplacement(duplicate)).rejects.toMatchObject({
      code: "DUPLICATE_REQUEST_ID",
    });

    const approvalRow = await queryOne<{ state: string }>(
      "SELECT state FROM approvals WHERE id = $1",
      [approval.id],
    );
    expect(approvalRow.state).toBe("RESERVED");

    const retry = await prepareReplacement(prepareInput(approval.id, "retry"));
    expect(retry.requestId).toBe("req_demo_replacement_retry");
  });

  it("resolves two simultaneous preparation calls to one replacement slot", async () => {
    const approval = await createReplaceableApproval();

    const results = await Promise.allSettled([
      prepareReplacement(prepareInput(approval.id, "race-a")),
      prepareReplacement(prepareInput(approval.id, "race-b")),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(
      1,
    );

    const rejected = results.find(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected",
    );
    expect(rejected).toBeDefined();
    expect(rejected?.reason).toBeInstanceOf(DomainError);
    expect([
      "POLICY_BLOCKS_REPLACEMENT",
      "REPLACEMENT_SLOT_USED",
      "APPROVAL_NOT_ACTIVE",
      "DUPLICATE_REQUEST_ID",
    ]).toContain((rejected?.reason as DomainError).code);

    const replacementCount = await queryCount(
      "SELECT count(*)::int AS count FROM transfer_attempts WHERE obligation_id = $1 AND kind = 'REPLACEMENT'",
      [OBLIGATION_ID],
    );
    expect(replacementCount).toBe(1);
  });

  it("resolves two simultaneous claims to one dispatcher claim", async () => {
    const approval = await createReplaceableApproval();
    const attempt = await prepareReplacement(
      prepareInput(approval.id, "claim-race"),
    );

    const results = await Promise.allSettled([
      claimPreparedOperation({
        operationId: attempt.id,
        claimant: "dispatcher-a",
      }),
      claimPreparedOperation({
        operationId: attempt.id,
        claimant: "dispatcher-b",
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(
      1,
    );

    const rejected = results.find(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected",
    );
    expect(rejected?.reason).toBeInstanceOf(DomainError);
    expect((rejected?.reason as DomainError).code).toBe(
      "OPERATION_ALREADY_CLAIMED",
    );

    const row = await queryOne<{
      dispatch_state: string;
      claimed_by: string;
    }>(
      "SELECT dispatch_state, claimed_by FROM transfer_attempts WHERE id = $1",
      [attempt.id],
    );
    expect(row.dispatch_state).toBe("DISPATCHING");
    expect(["dispatcher-a", "dispatcher-b"]).toContain(row.claimed_by);
  });

  it("records a lost response as UNKNOWN and never creates a second attempt", async () => {
    const approval = await createReplaceableApproval();
    const attempt = await prepareReplacement(
      prepareInput(approval.id, "lost"),
    );

    await claimPreparedOperation({
      operationId: attempt.id,
      claimant: "dispatcher-a",
    });
    const unknown = await markDispatchUnknown({
      operationId: attempt.id,
      claimant: "dispatcher-a",
      reason: "Response lost after the submission attempt.",
    });

    expect(unknown.dispatchState).toBe("UNKNOWN");

    const incident = await queryOne<{ app_state: string }>(
      "SELECT app_state FROM incidents WHERE id = $1",
      [INCIDENT_ID],
    );
    expect(incident.app_state).toBe("ESCALATED");

    const target = await getReconciliationTarget(attempt.id);
    expect(target.requestId).toBe(attempt.requestId);
    expect(target.dispatchState).toBe("UNKNOWN");

    await expect(
      createApproval({ incidentId: INCIDENT_ID, approver: APPROVER }),
    ).rejects.toMatchObject({ code: "POLICY_BLOCKS_APPROVAL" });

    const replacementCount = await queryCount(
      "SELECT count(*)::int AS count FROM transfer_attempts WHERE obligation_id = $1 AND kind = 'REPLACEMENT'",
      [OBLIGATION_ID],
    );
    expect(replacementCount).toBe(1);
  });

  it("allows only the current claimant to record an acknowledgement once", async () => {
    const approval = await createReplaceableApproval();
    const attempt = await prepareReplacement(
      prepareInput(approval.id, "ack"),
    );

    await claimPreparedOperation({
      operationId: attempt.id,
      claimant: "dispatcher-a",
    });

    await expect(
      markDispatchAcknowledged({
        operationId: attempt.id,
        claimant: "dispatcher-b",
        providerId: "tr_demo_replacement_001",
        providerStatus: "SENT",
      }),
    ).rejects.toMatchObject({ code: "INVALID_DISPATCH_TRANSITION" });

    const acknowledged = await markDispatchAcknowledged({
      operationId: attempt.id,
      claimant: "dispatcher-a",
      providerId: "tr_demo_replacement_001",
      providerStatus: "SENT",
    });

    expect(acknowledged.dispatchState).toBe("ACKNOWLEDGED");
    expect(acknowledged.providerStatus).toBe("SENT");
    expect(acknowledged.providerId).toBe("tr_demo_replacement_001");

    await expect(
      markDispatchAcknowledged({
        operationId: attempt.id,
        claimant: "dispatcher-a",
        providerId: "tr_demo_replacement_002",
        providerStatus: "PAID",
      }),
    ).rejects.toMatchObject({ code: "INVALID_DISPATCH_TRANSITION" });
  });

  it("ignores a failed refresh when selecting the latest successful evidence", async () => {
    await addFailedRefreshEvidence();

    const context = await withTransaction((client) =>
      loadPolicyContext(client, INCIDENT_ID),
    );

    expect(context.evidence.id).toBe("EVD-DEMO-001");
    expect(context.evidence.providerStatus).toBe("SENT");

    await expect(
      createApproval({ incidentId: INCIDENT_ID, approver: APPROVER }),
    ).rejects.toMatchObject({ code: "POLICY_BLOCKS_APPROVAL" });
  });

  it("keeps the audit trail append-only", async () => {
    await expect(
      createApproval({ incidentId: INCIDENT_ID, approver: APPROVER }),
    ).rejects.toMatchObject({ code: "POLICY_BLOCKS_APPROVAL" });

    await expect(
      withTransaction((client) =>
        client.query("UPDATE audit_events SET actor = 'tamper'"),
      ),
    ).rejects.toThrow(/audit_events are append-only/);
  });
});
