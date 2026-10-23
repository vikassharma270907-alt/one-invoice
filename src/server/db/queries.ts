import type { PoolClient } from "pg";

import { DomainError } from "@/server/domain/errors";
import type { PolicyFacts } from "@/server/policy/evaluate";

import {
  mapApproval,
  mapAttempt,
  mapEvidence,
  mapIncident,
  mapObligation,
  type ApprovalRecord,
  type AttemptRecord,
  type EvidenceRecord,
  type IncidentRecord,
  type ObligationRecord,
} from "./records";

export type PolicyContext = {
  incident: IncidentRecord;
  obligation: ObligationRecord;
  evidence: EvidenceRecord;
  facts: PolicyFacts;
};

export async function getIncident(
  client: PoolClient,
  incidentId: string,
): Promise<IncidentRecord> {
  const result = await client.query(
    "SELECT * FROM incidents WHERE id = $1",
    [incidentId],
  );

  if (!result.rows[0]) {
    throw new DomainError(
      "INCIDENT_NOT_FOUND",
      `Incident ${incidentId} was not found.`,
      404,
    );
  }

  return mapIncident(result.rows[0]);
}

export async function lockIncident(
  client: PoolClient,
  incidentId: string,
): Promise<IncidentRecord> {
  const result = await client.query(
    `SELECT i.*
     FROM incidents i
     JOIN obligations o ON o.id = i.obligation_id
     WHERE i.id = $1
     FOR UPDATE OF i, o`,
    [incidentId],
  );

  if (!result.rows[0]) {
    throw new DomainError(
      "INCIDENT_NOT_FOUND",
      `Incident ${incidentId} was not found.`,
      404,
    );
  }

  return mapIncident(result.rows[0]);
}

export async function getObligation(
  client: PoolClient,
  obligationId: string,
): Promise<ObligationRecord> {
  const result = await client.query(
    "SELECT * FROM obligations WHERE id = $1",
    [obligationId],
  );

  if (!result.rows[0]) {
    throw new DomainError(
      "OBLIGATION_NOT_FOUND",
      `Obligation ${obligationId} was not found.`,
      404,
    );
  }

  return mapObligation(result.rows[0]);
}

export async function getLatestSuccessfulEvidence(
  client: PoolClient,
  incidentId: string,
): Promise<EvidenceRecord | null> {
  const result = await client.query(
    `SELECT *
     FROM evidence_snapshots
     WHERE incident_id = $1 AND refresh_status = 'SUCCESS'
     ORDER BY fetched_at DESC, id DESC
     LIMIT 1`,
    [incidentId],
  );

  return result.rows[0] ? mapEvidence(result.rows[0]) : null;
}

export async function loadPolicyContext(
  client: PoolClient,
  incidentId: string,
): Promise<PolicyContext> {
  const incident = await getIncident(client, incidentId);
  const obligation = await getObligation(client, incident.obligationId);
  const evidence = await getLatestSuccessfulEvidence(client, incidentId);

  if (!evidence) {
    throw new DomainError(
      "EVIDENCE_NOT_FOUND",
      "No successful evidence snapshot is available. Refresh evidence before evaluating policy.",
      409,
    );
  }

  if (
    evidence.providerStatus === null ||
    evidence.availableBalanceMinor === null ||
    evidence.currency === null ||
    evidence.beneficiaryFingerprint === null ||
    evidence.amountMinor === null
  ) {
    throw new DomainError(
      "INVALID_EVIDENCE",
      "The latest successful evidence snapshot is incomplete.",
      409,
    );
  }

  const attemptsResult = await client.query(
    `SELECT kind, request_id, provider_id
     FROM transfer_attempts
     WHERE obligation_id = $1
     ORDER BY created_at ASC`,
    [obligation.id],
  );

  const attempts = attemptsResult.rows.map((row) => ({
    kind: String(row.kind) as "ORIGINAL" | "REPLACEMENT",
    requestId: String(row.request_id),
    providerId:
      row.provider_id === null || row.provider_id === undefined
        ? null
        : String(row.provider_id),
  }));

  return {
    incident,
    obligation,
    evidence,
    facts: {
      obligation: {
        amountMinor: obligation.amountMinor,
        currency: "USD",
        feeAllowanceMinor: obligation.feeAllowanceMinor,
        beneficiaryFingerprint: obligation.beneficiaryFingerprint,
      },
      evidence: {
        id: evidence.id,
        providerStatus: evidence.providerStatus,
        providerRequestId: evidence.providerRequestId,
        providerTransferId: evidence.providerTransferId,
        availableBalanceMinor: evidence.availableBalanceMinor,
        currency: evidence.currency,
        beneficiaryFingerprint: evidence.beneficiaryFingerprint,
        amountMinor: evidence.amountMinor,
        failureCode: evidence.failureCode,
      },
      attempts,
    },
  };
}

export async function getReplacementAttempt(
  client: PoolClient,
  obligationId: string,
): Promise<AttemptRecord | null> {
  const result = await client.query(
    `SELECT *
     FROM transfer_attempts
     WHERE obligation_id = $1 AND kind = 'REPLACEMENT'
     LIMIT 1`,
    [obligationId],
  );

  return result.rows[0] ? mapAttempt(result.rows[0]) : null;
}

export async function getApprovalForUpdate(
  client: PoolClient,
  approvalId: string,
): Promise<ApprovalRecord | null> {
  const result = await client.query(
    "SELECT * FROM approvals WHERE id = $1 FOR UPDATE",
    [approvalId],
  );

  return result.rows[0] ? mapApproval(result.rows[0]) : null;
}

export async function getApprovalById(
  client: PoolClient,
  approvalId: string,
): Promise<ApprovalRecord | null> {
  const result = await client.query(
    "SELECT * FROM approvals WHERE id = $1",
    [approvalId],
  );

  return result.rows[0] ? mapApproval(result.rows[0]) : null;
}

export async function getAttemptForUpdate(
  client: PoolClient,
  operationId: string,
): Promise<AttemptRecord | null> {
  const result = await client.query(
    "SELECT * FROM transfer_attempts WHERE id = $1 FOR UPDATE",
    [operationId],
  );

  return result.rows[0] ? mapAttempt(result.rows[0]) : null;
}

export async function getAttemptById(
  client: PoolClient,
  operationId: string,
): Promise<AttemptRecord | null> {
  const result = await client.query(
    "SELECT * FROM transfer_attempts WHERE id = $1",
    [operationId],
  );

  return result.rows[0] ? mapAttempt(result.rows[0]) : null;
}

export type AppendAuditEventInput = {
  incidentId: string;
  actor: string;
  eventType: string;
  correlationId: string;
  safeDetails: Record<string, unknown>;
  now?: Date;
};

export async function appendAuditEvent(
  client: PoolClient,
  input: AppendAuditEventInput,
): Promise<void> {
  await client.query(
    `INSERT INTO audit_events
       (incident_id, actor, event_type, correlation_id, safe_details, created_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, COALESCE($6, now()))`,
    [
      input.incidentId,
      input.actor,
      input.eventType,
      input.correlationId,
      JSON.stringify(input.safeDetails),
      input.now ?? null,
    ],
  );
}

export async function updateIncidentProjection(
  client: PoolClient,
  incidentId: string,
  appState: IncidentRecord["appState"],
  policyVersion: string,
  now: Date,
): Promise<void> {
  await client.query(
    `UPDATE incidents
     SET app_state = $2,
         policy_version = $3,
         updated_at = $4,
         version = version + 1
     WHERE id = $1`,
    [incidentId, appState, policyVersion, now],
  );
}
