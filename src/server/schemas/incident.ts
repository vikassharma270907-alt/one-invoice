import { z } from "zod";

export const CURRENCY = "USD" as const;

export const currencySchema = z.literal(CURRENCY);

export const actionSchema = z.enum([
  "WAIT",
  "ESCALATE",
  "PREPARE_REPLACEMENT",
  "APPROVE",
  "EXECUTE",
]);

export const providerStatusSchema = z.enum([
  "SENT",
  "PAID",
  "FAILED",
  "CANCELLED",
  "UNKNOWN",
]);

export const dispatchStateSchema = z.enum([
  "PREPARED",
  "DISPATCHING",
  "ACKNOWLEDGED",
  "UNKNOWN",
]);

export const incidentStateSchema = z.enum([
  "ORIGINAL_SENT",
  "ORIGINAL_PAID",
  "FAILURE_CONFIRMED_REPLACEABLE",
  "ESCALATED",
  "RECONCILED",
]);

export const dataSourceSchema = z.enum(["fixture", "sandbox"]);

const minorUnitsSchema = z.number().int().nonnegative().max(100_000_000);

export const beneficiarySchema = z
  .object({
    id: z.string().min(1).max(64),
    alias: z.string().min(1).max(120),
    fingerprint: z.string().min(1).max(120),
    country: z.string().length(2),
  })
  .strict();

export const supplierMessageSchema = z
  .object({
    raw: z.string().min(1).max(4000),
    receivedAt: z.iso.datetime(),
    trust: z.literal("UNTRUSTED"),
  })
  .strict();

export const evidenceSnapshotSchema = z
  .object({
    id: z.string().min(1).max(64),
    source: dataSourceSchema,
    fetchedAt: z.iso.datetime(),
    providerStatus: providerStatusSchema,
    providerTransferId: z.string().min(1).max(128).nullable(),
    providerRequestId: z.string().min(1).max(128).nullable(),
    availableBalanceMinor: minorUnitsSchema,
    currency: currencySchema,
    beneficiaryFingerprint: z.string().min(1).max(120),
    amountMinor: minorUnitsSchema,
    failureCode: z.string().min(1).max(120).nullable(),
    failureDetail: z.string().min(1).max(1000).nullable(),
    notes: z.string().max(1000),
  })
  .strict();

export const transferAttemptSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.enum(["ORIGINAL", "REPLACEMENT"]),
    requestId: z.string().min(1).max(128),
    providerId: z.string().min(1).max(128).nullable(),
    providerStatus: providerStatusSchema,
    failureCode: z.string().min(1).max(120).nullable(),
    failureDetail: z.string().min(1).max(1000).nullable(),
    dispatchState: dispatchStateSchema,
    approvedPayloadHash: z.string().min(1).max(128).nullable(),
  })
  .strict();

export const proposalSchema = z
  .object({
    id: z.string().min(1).max(64),
    evidenceVersion: z.string().min(1).max(64),
    suggestedAction: z.enum(["WAIT", "ESCALATE", "PREPARE_REPLACEMENT"]),
    reasons: z.array(z.string().min(1).max(500)).max(10),
    evidenceIds: z.array(z.string().min(1).max(64)).max(5),
    schemaValid: z.boolean(),
    source: z.literal("fixture-deterministic"),
  })
  .strict();

export const approvalSchema = z
  .object({
    id: z.string().min(1).max(64),
    approver: z.string().min(1).max(120),
    termsHash: z.string().min(1).max(128),
    evidenceVersion: z.string().min(1).max(64),
    policyVersion: z.string().min(1).max(64),
    expiresAt: z.iso.datetime(),
    state: z.enum(["RESERVED", "CONSUMED", "REVOKED", "EXPIRED"]),
  })
  .strict();

export const timelineEventSchema = z
  .object({
    id: z.string().min(1).max(64),
    at: z.iso.datetime(),
    actor: z.enum(["SYSTEM", "OPERATOR", "SUPPLIER", "PROVIDER"]),
    type: z.string().min(1).max(80),
    summary: z.string().min(1).max(500),
    correlationId: z.string().min(1).max(80),
  })
  .strict();

export const incidentSchema = z
  .object({
    id: z.string().min(1).max(64),
    invoiceReference: z.string().regex(/^DEMO-INV-\d{3}$/),
    companyName: z.string().min(1).max(120),
    obligation: z
      .object({
        id: z.string().min(1).max(64),
        amountMinor: minorUnitsSchema,
        currency: currencySchema,
        feeAllowanceMinor: minorUnitsSchema,
        beneficiary: beneficiarySchema,
        version: z.number().int().positive(),
      })
      .strict(),
    supplierMessage: supplierMessageSchema,
    state: incidentStateSchema,
    evidence: evidenceSnapshotSchema,
    attempts: z.array(transferAttemptSchema).min(1).max(2),
    proposal: proposalSchema.nullable(),
    approval: approvalSchema.nullable(),
    timeline: z.array(timelineEventSchema).max(50),
    policyVersion: z.string().min(1).max(64),
    labels: z
      .object({
        dataSource: z.literal("fixture"),
        liveCalls: z.literal(false),
      })
      .strict(),
  })
  .strict();

export const analysisSchema = z
  .object({
    invoiceReference: z.string().nullable(),
    suggestedAction: z.enum(["WAIT", "ESCALATE", "PREPARE_REPLACEMENT"]),
    evidenceIds: z.array(z.string()).max(5),
    supplierClaims: z.array(z.string().max(300)).max(10),
    missingInformation: z.array(z.string().max(300)).max(10),
    explanation: z.string().min(1).max(2000),
    untrustedContent: z.literal(true),
    source: z.literal("fixture-deterministic"),
  })
  .strict();

export type Incident = z.infer<typeof incidentSchema>;
export type EvidenceSnapshot = z.infer<typeof evidenceSnapshotSchema>;
export type TransferAttempt = z.infer<typeof transferAttemptSchema>;
export type ComplaintAnalysis = z.infer<typeof analysisSchema>;
export type Action = z.infer<typeof actionSchema>;
export type ProviderStatus = z.infer<typeof providerStatusSchema>;
export type IncidentState = z.infer<typeof incidentStateSchema>;
