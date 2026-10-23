export type ObligationRecord = {
  id: string;
  invoiceReference: string;
  companyId: string;
  companyName: string;
  amountMinor: number;
  currency: "USD";
  feeAllowanceMinor: number;
  beneficiaryId: string;
  beneficiaryAlias: string;
  beneficiaryFingerprint: string;
  beneficiaryCountry: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type IncidentRecord = {
  id: string;
  obligationId: string;
  complaintText: string;
  complaintReceivedAt: Date;
  appState:
    | "ORIGINAL_SENT"
    | "ORIGINAL_PAID"
    | "FAILURE_CONFIRMED_REPLACEABLE"
    | "REPLACEMENT_PREPARED"
    | "ESCALATED"
    | "RECONCILED";
  policyVersion: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type EvidenceRecord = {
  id: string;
  incidentId: string;
  source: "fixture" | "sandbox";
  refreshStatus: "SUCCESS" | "FAILED";
  fetchedAt: Date;
  providerStatus:
    | "SENT"
    | "PAID"
    | "FAILED"
    | "CANCELLED"
    | "UNKNOWN"
    | null;
  providerTransferId: string | null;
  providerRequestId: string | null;
  availableBalanceMinor: number | null;
  currency: "USD" | null;
  beneficiaryFingerprint: string | null;
  amountMinor: number | null;
  failureCode: string | null;
  failureDetail: string | null;
  valuesHash: string;
  errorDetail: string | null;
  createdAt: Date;
};

export type ApprovalRecord = {
  id: string;
  incidentId: string;
  approver: string;
  termsHash: string;
  terms: unknown;
  evidenceVersion: string;
  policyVersion: string;
  expiresAt: Date;
  state: "RESERVED" | "CONSUMED" | "REVOKED" | "EXPIRED";
  reservedAt: Date | null;
  consumedAt: Date | null;
  createdAt: Date;
};

export type AttemptRecord = {
  id: string;
  obligationId: string;
  incidentId: string;
  kind: "ORIGINAL" | "REPLACEMENT";
  requestId: string;
  providerId: string | null;
  dispatchState: "PREPARED" | "DISPATCHING" | "ACKNOWLEDGED" | "UNKNOWN";
  providerStatus:
    | "SENT"
    | "PAID"
    | "FAILED"
    | "CANCELLED"
    | "UNKNOWN"
    | null;
  failureCode: string | null;
  failureDetail: string | null;
  payload: unknown;
  payloadHash: string | null;
  approvalId: string | null;
  claimedBy: string | null;
  claimedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type Row = Record<string, unknown>;

function text(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Expected string for ${field}`);
  }
  return value;
}

function nullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error("Expected nullable string");
  return value;
}

function numberValue(value: unknown, field: string): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error(`Expected number for ${field}`);
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return numberValue(value, "nullable number");
}

function dateValue(value: unknown, field: string): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  throw new Error(`Expected timestamp for ${field}`);
}

function nullableDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  return dateValue(value, "nullable timestamp");
}

export function mapObligation(row: Row): ObligationRecord {
  return {
    id: text(row.id, "obligations.id"),
    invoiceReference: text(
      row.invoice_reference,
      "obligations.invoice_reference",
    ),
    companyId: text(row.company_id, "obligations.company_id"),
    companyName: text(row.company_name, "obligations.company_name"),
    amountMinor: numberValue(row.amount_minor, "obligations.amount_minor"),
    currency: "USD",
    feeAllowanceMinor: numberValue(
      row.fee_allowance_minor,
      "obligations.fee_allowance_minor",
    ),
    beneficiaryId: text(
      row.beneficiary_id,
      "obligations.beneficiary_id",
    ),
    beneficiaryAlias: text(
      row.beneficiary_alias,
      "obligations.beneficiary_alias",
    ),
    beneficiaryFingerprint: text(
      row.beneficiary_fingerprint,
      "obligations.beneficiary_fingerprint",
    ),
    beneficiaryCountry: text(
      row.beneficiary_country,
      "obligations.beneficiary_country",
    ),
    version: numberValue(row.version, "obligations.version"),
    createdAt: dateValue(row.created_at, "obligations.created_at"),
    updatedAt: dateValue(row.updated_at, "obligations.updated_at"),
  };
}

export function mapIncident(row: Row): IncidentRecord {
  return {
    id: text(row.id, "incidents.id"),
    obligationId: text(row.obligation_id, "incidents.obligation_id"),
    complaintText: text(row.complaint_text, "incidents.complaint_text"),
    complaintReceivedAt: dateValue(
      row.complaint_received_at,
      "incidents.complaint_received_at",
    ),
    appState: text(row.app_state, "incidents.app_state") as IncidentRecord["appState"],
    policyVersion: text(row.policy_version, "incidents.policy_version"),
    version: numberValue(row.version, "incidents.version"),
    createdAt: dateValue(row.created_at, "incidents.created_at"),
    updatedAt: dateValue(row.updated_at, "incidents.updated_at"),
  };
}

export function mapEvidence(row: Row): EvidenceRecord {
  const currency = nullableText(row.currency);
  if (currency !== null && currency !== "USD") {
    throw new Error("Unexpected evidence currency");
  }

  return {
    id: text(row.id, "evidence_snapshots.id"),
    incidentId: text(row.incident_id, "evidence_snapshots.incident_id"),
    source: text(row.source, "evidence_snapshots.source") as EvidenceRecord["source"],
    refreshStatus: text(
      row.refresh_status,
      "evidence_snapshots.refresh_status",
    ) as EvidenceRecord["refreshStatus"],
    fetchedAt: dateValue(row.fetched_at, "evidence_snapshots.fetched_at"),
    providerStatus: nullableText(
      row.provider_status,
    ) as EvidenceRecord["providerStatus"],
    providerTransferId: nullableText(row.provider_transfer_id),
    providerRequestId: nullableText(row.provider_request_id),
    availableBalanceMinor: nullableNumber(row.available_balance_minor),
    currency,
    beneficiaryFingerprint: nullableText(row.beneficiary_fingerprint),
    amountMinor: nullableNumber(row.amount_minor),
    failureCode: nullableText(row.failure_code),
    failureDetail: nullableText(row.failure_detail),
    valuesHash: text(row.values_hash, "evidence_snapshots.values_hash"),
    errorDetail: nullableText(row.error_detail),
    createdAt: dateValue(row.created_at, "evidence_snapshots.created_at"),
  };
}

export function mapApproval(row: Row): ApprovalRecord {
  return {
    id: text(row.id, "approvals.id"),
    incidentId: text(row.incident_id, "approvals.incident_id"),
    approver: text(row.approver, "approvals.approver"),
    termsHash: text(row.terms_hash, "approvals.terms_hash"),
    terms: row.terms,
    evidenceVersion: text(row.evidence_version, "approvals.evidence_version"),
    policyVersion: text(row.policy_version, "approvals.policy_version"),
    expiresAt: dateValue(row.expires_at, "approvals.expires_at"),
    state: text(row.state, "approvals.state") as ApprovalRecord["state"],
    reservedAt: nullableDate(row.reserved_at),
    consumedAt: nullableDate(row.consumed_at),
    createdAt: dateValue(row.created_at, "approvals.created_at"),
  };
}

export function mapAttempt(row: Row): AttemptRecord {
  return {
    id: text(row.id, "transfer_attempts.id"),
    obligationId: text(row.obligation_id, "transfer_attempts.obligation_id"),
    incidentId: text(row.incident_id, "transfer_attempts.incident_id"),
    kind: text(row.kind, "transfer_attempts.kind") as AttemptRecord["kind"],
    requestId: text(row.request_id, "transfer_attempts.request_id"),
    providerId: nullableText(row.provider_id),
    dispatchState: text(
      row.dispatch_state,
      "transfer_attempts.dispatch_state",
    ) as AttemptRecord["dispatchState"],
    providerStatus: nullableText(
      row.provider_status,
    ) as AttemptRecord["providerStatus"],
    failureCode: nullableText(row.failure_code),
    failureDetail: nullableText(row.failure_detail),
    payload: row.payload,
    payloadHash: nullableText(row.payload_hash),
    approvalId: nullableText(row.approval_id),
    claimedBy: nullableText(row.claimed_by),
    claimedAt: nullableDate(row.claimed_at),
    createdAt: dateValue(row.created_at, "transfer_attempts.created_at"),
    updatedAt: dateValue(row.updated_at, "transfer_attempts.updated_at"),
  };
}
