import type { PoolClient } from "pg";

import rawIncident from "../../../fixtures/synthetic/incident.json";
import { hashPayload } from "@/server/approvals/terms";
import { incidentSchema } from "@/server/schemas/incident";

export type SeedResult = {
  obligationId: string;
  incidentId: string;
  evidenceId: string;
  originalAttemptId: string;
};

/**
 * Idempotent synthetic seed for local development and integration tests.
 * It never calls a provider and never creates an approval.
 */
export async function seedDemoIncident(
  client: PoolClient,
  options: { evidenceFetchedAt?: Date } = {},
): Promise<SeedResult> {
  const incident = incidentSchema.parse(rawIncident);
  const companyId = "DEMO-CO-001";
  const fetchedAt =
    options.evidenceFetchedAt ?? new Date(incident.evidence.fetchedAt);

  await client.query(
    `INSERT INTO obligations
       (id, invoice_reference, company_id, company_name, amount_minor, currency,
        fee_allowance_minor, beneficiary_id, beneficiary_alias,
        beneficiary_fingerprint, beneficiary_country, version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT DO NOTHING`,
    [
      incident.obligation.id,
      incident.invoiceReference,
      companyId,
      incident.companyName,
      incident.obligation.amountMinor,
      incident.obligation.currency,
      incident.obligation.feeAllowanceMinor,
      incident.obligation.beneficiary.id,
      incident.obligation.beneficiary.alias,
      incident.obligation.beneficiary.fingerprint,
      incident.obligation.beneficiary.country,
      incident.obligation.version,
    ],
  );

  await client.query(
    `INSERT INTO incidents
       (id, obligation_id, complaint_text, complaint_received_at, app_state,
        policy_version, version)
     VALUES ($1, $2, $3, $4, $5, $6, 1)
     ON CONFLICT DO NOTHING`,
    [
      incident.id,
      incident.obligation.id,
      incident.supplierMessage.raw,
      new Date(incident.supplierMessage.receivedAt),
      incident.state,
      incident.policyVersion,
    ],
  );

  const valuesHash = hashPayload({
    source: incident.evidence.source,
    providerStatus: incident.evidence.providerStatus,
    providerTransferId: incident.evidence.providerTransferId,
    providerRequestId: incident.evidence.providerRequestId,
    availableBalanceMinor: incident.evidence.availableBalanceMinor,
    currency: incident.evidence.currency,
    beneficiaryFingerprint: incident.evidence.beneficiaryFingerprint,
    amountMinor: incident.evidence.amountMinor,
    failureCode: incident.evidence.failureCode,
    failureDetail: incident.evidence.failureDetail,
  });

  await client.query(
    `INSERT INTO evidence_snapshots
       (id, incident_id, source, refresh_status, fetched_at, provider_status,
        provider_transfer_id, provider_request_id, available_balance_minor,
        currency, beneficiary_fingerprint, amount_minor, failure_code,
        failure_detail, values_hash, error_detail)
     VALUES ($1, $2, $3, 'SUCCESS', $4, $5, $6, $7, $8, $9, $10, $11, $12,
             $13, $14, NULL)
     ON CONFLICT DO NOTHING`,
    [
      incident.evidence.id,
      incident.id,
      incident.evidence.source,
      fetchedAt,
      incident.evidence.providerStatus,
      incident.evidence.providerTransferId,
      incident.evidence.providerRequestId,
      incident.evidence.availableBalanceMinor,
      incident.evidence.currency,
      incident.evidence.beneficiaryFingerprint,
      incident.evidence.amountMinor,
      incident.evidence.failureCode,
      incident.evidence.failureDetail,
      valuesHash,
    ],
  );

  const original = incident.attempts.find(
    (attempt) => attempt.kind === "ORIGINAL",
  );

  if (!original) {
    throw new Error("Demo fixture must contain an original attempt.");
  }

  await client.query(
    `INSERT INTO transfer_attempts
       (id, obligation_id, incident_id, kind, request_id, provider_id,
        dispatch_state, provider_status, failure_code, failure_detail, payload,
        payload_hash, approval_id, claimed_by, claimed_at, created_at, updated_at)
     VALUES ($1, $2, $3, 'ORIGINAL', $4, $5, 'ACKNOWLEDGED', $6, $7, $8,
             NULL, NULL, NULL, 'fixture-seed', $9, $9, $9)
     ON CONFLICT DO NOTHING`,
    [
      original.id,
      incident.obligation.id,
      incident.id,
      original.requestId,
      original.providerId,
      original.providerStatus,
      original.failureCode,
      original.failureDetail,
      fetchedAt,
    ],
  );

  return {
    obligationId: incident.obligation.id,
    incidentId: incident.id,
    evidenceId: incident.evidence.id,
    originalAttemptId: original.id,
  };
}
