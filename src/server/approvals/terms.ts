import { createHash } from "node:crypto";

import type { IncidentRecord, ObligationRecord } from "@/server/db/records";
import type { PolicyDecision, PolicyFacts } from "@/server/policy/evaluate";

export type ApprovalTerms = {
  version: 1;
  scope: "ONE_REPLACEMENT_ATTEMPT";
  incidentId: string;
  obligationId: string;
  invoiceReference: string;
  amountMinor: number;
  currency: "USD";
  feeAllowanceMinor: number;
  beneficiaryId: string;
  beneficiaryFingerprint: string;
  originalTransferId: string | null;
  originalRequestId: string;
  evidenceVersion: string;
  policyVersion: string;
  kind: "REPLACEMENT";
};

export function buildApprovalTerms(input: {
  incident: IncidentRecord;
  obligation: ObligationRecord;
  facts: PolicyFacts;
  decision: PolicyDecision;
}): ApprovalTerms {
  const original = input.facts.attempts.find(
    (attempt) => attempt.kind === "ORIGINAL",
  );

  if (!original) {
    throw new Error("Approval terms require a recorded original attempt.");
  }

  return {
    version: 1,
    scope: "ONE_REPLACEMENT_ATTEMPT",
    incidentId: input.incident.id,
    obligationId: input.obligation.id,
    invoiceReference: input.obligation.invoiceReference,
    amountMinor: input.obligation.amountMinor,
    currency: input.obligation.currency,
    feeAllowanceMinor: input.obligation.feeAllowanceMinor,
    beneficiaryId: input.obligation.beneficiaryId,
    beneficiaryFingerprint: input.obligation.beneficiaryFingerprint,
    originalTransferId: original.providerId,
    originalRequestId: original.requestId,
    evidenceVersion: input.decision.evidenceVersion,
    policyVersion: input.decision.policyVersion,
    kind: "REPLACEMENT",
  };
}

/**
 * Deterministic JSON serialisation used for hashes. Object keys are sorted so
 * the same semantic value always produces the same hash.
 */
export function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null) return "null";
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function hashApprovalTerms(terms: ApprovalTerms): string {
  return createHash("sha256").update(stableStringify(terms)).digest("hex");
}

export function hashPayload(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}
