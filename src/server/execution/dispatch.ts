import { randomUUID } from "node:crypto";

import {
  hashApprovalTerms,
  hashPayload,
  buildApprovalTerms,
} from "@/server/approvals/terms";
import {
  mapAttempt,
  type AttemptRecord,
} from "@/server/db/records";
import {
  appendAuditEvent,
  getApprovalForUpdate,
  getAttemptById,
  getAttemptForUpdate,
  getReplacementAttempt,
  loadPolicyContext,
  lockIncident,
  updateIncidentProjection,
} from "@/server/db/queries";
import { withTransaction } from "@/server/db/pool";
import { DomainError, isPgUniqueViolation } from "@/server/domain/errors";
import { POLICY_VERSION, evaluatePolicyFacts } from "@/server/policy/evaluate";
import {
  providerStatusSchema,
  type ProviderStatus,
} from "@/server/schemas/incident";

type TxResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: DomainError };

export type PrepareReplacementInput = {
  incidentId: string;
  approvalId: string;
  operationId: string;
  requestId: string;
  payload: Record<string, unknown>;
  actor: string;
  now?: Date;
  correlationId?: string;
};

export type ClaimedOperation = {
  operation: AttemptRecord;
  payload: Record<string, unknown>;
};

function asPayload(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DomainError(
      "INVALID_PAYLOAD",
      "The stored operation payload is not a JSON object.",
    );
  }
  return value as Record<string, unknown>;
}

/**
 * Reserves the single replacement slot and consumes the approval in one
 * transaction. This method does not make a network call.
 */
export async function prepareReplacement(
  input: PrepareReplacementInput,
): Promise<AttemptRecord> {
  if (!input.actor.trim()) {
    throw new DomainError("ACTOR_REQUIRED", "An actor is required.");
  }
  if (!input.requestId.trim()) {
    throw new DomainError("REQUEST_ID_REQUIRED", "A request ID is required.");
  }
  const payload = asPayload(input.payload);

  const now = input.now ?? new Date();
  const correlationId = input.correlationId ?? randomUUID();
  const payloadHash = hashPayload(payload);

  try {
    const result = await withTransaction<TxResult<AttemptRecord>>(
      async (client) => {
        const incident = await lockIncident(client, input.incidentId);
        const context = await loadPolicyContext(client, input.incidentId);
        const decision = evaluatePolicyFacts(context.facts);

        await updateIncidentProjection(
          client,
          incident.id,
          decision.state,
          decision.policyVersion,
          now,
        );

        if (!decision.replacementAllowed || !decision.requiresApproval) {
          await appendAuditEvent(client, {
            incidentId: incident.id,
            actor: input.actor,
            eventType: "REPLACEMENT_BLOCKED",
            correlationId,
            safeDetails: {
              reasons: decision.reasons,
              evidenceVersion: decision.evidenceVersion,
              policyVersion: decision.policyVersion,
            },
            now,
          });
          return {
            ok: false,
            error: new DomainError(
              "POLICY_BLOCKS_REPLACEMENT",
              decision.reasons.join(" "),
            ),
          };
        }

        const existingReplacement = await getReplacementAttempt(
          client,
          incident.obligationId,
        );
        if (existingReplacement) {
          await appendAuditEvent(client, {
            incidentId: incident.id,
            actor: input.actor,
            eventType: "REPLACEMENT_BLOCKED",
            correlationId,
            safeDetails: {
              reason: "REPLACEMENT_SLOT_USED",
              operationId: existingReplacement.id,
            },
            now,
          });
          return {
            ok: false,
            error: new DomainError(
              "REPLACEMENT_SLOT_USED",
              "The single replacement slot has already been used.",
            ),
          };
        }

        const approval = await getApprovalForUpdate(
          client,
          input.approvalId,
        );
        if (!approval) {
          return {
            ok: false,
            error: new DomainError(
              "APPROVAL_NOT_FOUND",
              "The approval was not found for this incident.",
              404,
            ),
          };
        }

        if (approval.incidentId !== incident.id) {
          return {
            ok: false,
            error: new DomainError(
              "APPROVAL_INCIDENT_MISMATCH",
              "The approval belongs to a different incident.",
            ),
          };
        }

        if (approval.state !== "RESERVED") {
          return {
            ok: false,
            error: new DomainError(
              "APPROVAL_NOT_ACTIVE",
              "The approval is not in a reserved state.",
            ),
          };
        }

        if (approval.expiresAt.getTime() <= now.getTime()) {
          await client.query(
            "UPDATE approvals SET state = 'EXPIRED' WHERE id = $1",
            [approval.id],
          );
          await updateIncidentProjection(
            client,
            incident.id,
            "ESCALATED",
            decision.policyVersion,
            now,
          );
          await appendAuditEvent(client, {
            incidentId: incident.id,
            actor: input.actor,
            eventType: "APPROVAL_EXPIRED",
            correlationId,
            safeDetails: {
              approvalId: approval.id,
              expiresAt: approval.expiresAt.toISOString(),
            },
            now,
          });
          return {
            ok: false,
            error: new DomainError(
              "APPROVAL_EXPIRED",
              "The approval has expired and cannot authorise this operation.",
            ),
          };
        }

        if (approval.evidenceVersion !== decision.evidenceVersion) {
          await client.query(
            "UPDATE approvals SET state = 'REVOKED' WHERE id = $1",
            [approval.id],
          );
          await updateIncidentProjection(
            client,
            incident.id,
            "ESCALATED",
            decision.policyVersion,
            now,
          );
          await appendAuditEvent(client, {
            incidentId: incident.id,
            actor: input.actor,
            eventType: "APPROVAL_STALE",
            correlationId,
            safeDetails: {
              approvalId: approval.id,
              approvedEvidenceVersion: approval.evidenceVersion,
              currentEvidenceVersion: decision.evidenceVersion,
            },
            now,
          });
          return {
            ok: false,
            error: new DomainError(
              "APPROVAL_STALE",
              "The evidence changed after approval. A new approval is required.",
            ),
          };
        }

        if (approval.policyVersion !== decision.policyVersion) {
          await client.query(
            "UPDATE approvals SET state = 'REVOKED' WHERE id = $1",
            [approval.id],
          );
          await updateIncidentProjection(
            client,
            incident.id,
            "ESCALATED",
            decision.policyVersion,
            now,
          );
          await appendAuditEvent(client, {
            incidentId: incident.id,
            actor: input.actor,
            eventType: "APPROVAL_STALE",
            correlationId,
            safeDetails: {
              approvalId: approval.id,
              approvedPolicyVersion: approval.policyVersion,
              currentPolicyVersion: decision.policyVersion,
            },
            now,
          });
          return {
            ok: false,
            error: new DomainError(
              "APPROVAL_STALE",
              "The policy version changed after approval. A new approval is required.",
            ),
          };
        }

        const currentTerms = buildApprovalTerms({
          incident,
          obligation: context.obligation,
          facts: context.facts,
          decision,
        });
        const currentTermsHash = hashApprovalTerms(currentTerms);

        if (approval.termsHash !== currentTermsHash) {
          await client.query(
            "UPDATE approvals SET state = 'REVOKED' WHERE id = $1",
            [approval.id],
          );
          await updateIncidentProjection(
            client,
            incident.id,
            "ESCALATED",
            decision.policyVersion,
            now,
          );
          await appendAuditEvent(client, {
            incidentId: incident.id,
            actor: input.actor,
            eventType: "APPROVAL_TERMS_MISMATCH",
            correlationId,
            safeDetails: {
              approvalId: approval.id,
              approvedTermsHash: approval.termsHash,
              currentTermsHash,
            },
            now,
          });
          return {
            ok: false,
            error: new DomainError(
              "APPROVAL_TERMS_MISMATCH",
              "The approval does not match the current exact terms.",
            ),
          };
        }

        const inserted = await client.query(
          `INSERT INTO transfer_attempts
             (id, obligation_id, incident_id, kind, request_id, provider_id,
              dispatch_state, provider_status, failure_code, failure_detail,
              payload, payload_hash, approval_id, claimed_by, claimed_at,
              created_at, updated_at)
           VALUES ($1, $2, $3, 'REPLACEMENT', $4, NULL, 'PREPARED', NULL,
                   NULL, NULL, $5::jsonb, $6, $7, NULL, NULL, $8, $8)
           RETURNING *`,
          [
            input.operationId,
            incident.obligationId,
            incident.id,
            input.requestId,
            JSON.stringify(payload),
            payloadHash,
            approval.id,
            now,
          ],
        );

        const consumed = await client.query(
          `UPDATE approvals
           SET state = 'CONSUMED', consumed_at = $2
           WHERE id = $1 AND state = 'RESERVED'`,
          [approval.id, now],
        );

        if ((consumed.rowCount ?? 0) !== 1) {
          throw new DomainError(
            "APPROVAL_NOT_ACTIVE",
            "The approval could not be consumed.",
          );
        }

        await updateIncidentProjection(
          client,
          incident.id,
          "REPLACEMENT_PREPARED",
          decision.policyVersion,
          now,
        );

        await appendAuditEvent(client, {
          incidentId: incident.id,
          actor: input.actor,
          eventType: "REPLACEMENT_PREPARED",
          correlationId,
          safeDetails: {
            operationId: input.operationId,
            requestId: input.requestId,
            approvalId: approval.id,
            payloadHash,
            evidenceVersion: decision.evidenceVersion,
            policyVersion: decision.policyVersion,
          },
          now,
        });

        return { ok: true, value: mapAttempt(inserted.rows[0]) };
      },
    );

    if (!result.ok) throw result.error;
    return result.value;
  } catch (error) {
    if (isPgUniqueViolation(error, "transfer_attempts_request_id_key")) {
      throw new DomainError(
        "DUPLICATE_REQUEST_ID",
        "The request ID is already in use.",
      );
    }
    if (
      isPgUniqueViolation(error, "transfer_attempts_obligation_id_kind_key") ||
      isPgUniqueViolation(error, "transfer_attempts_one_per_approval")
    ) {
      throw new DomainError(
        "REPLACEMENT_SLOT_USED",
        "The single replacement slot or approval has already been used.",
      );
    }
    throw error;
  }
}

export type ClaimPreparedOperationInput = {
  operationId: string;
  claimant: string;
  now?: Date;
  correlationId?: string;
};

/**
 * Atomically claims a prepared operation. Only the claimant may dispatch it.
 * A second claim must not trigger a second provider POST.
 */
export async function claimPreparedOperation(
  input: ClaimPreparedOperationInput,
): Promise<ClaimedOperation> {
  if (!input.claimant.trim()) {
    throw new DomainError("CLAIMANT_REQUIRED", "A claimant is required.");
  }

  const now = input.now ?? new Date();
  const correlationId = input.correlationId ?? randomUUID();

  const result = await withTransaction<TxResult<ClaimedOperation>>(
    async (client) => {
      const attempt = await getAttemptForUpdate(client, input.operationId);

      if (!attempt) {
        return {
          ok: false,
          error: new DomainError(
            "OPERATION_NOT_FOUND",
            "The prepared operation was not found.",
            404,
          ),
        };
      }

      if (attempt.kind !== "REPLACEMENT") {
        return {
          ok: false,
          error: new DomainError(
            "INVALID_OPERATION_KIND",
            "Only a prepared replacement can be claimed by the dispatcher.",
          ),
        };
      }

      if (attempt.dispatchState !== "PREPARED") {
        return {
          ok: false,
          error: new DomainError(
            "OPERATION_ALREADY_CLAIMED",
            "The operation is not in a claimable state. No automatic retry is permitted.",
          ),
        };
      }

      const updated = await client.query(
        `UPDATE transfer_attempts
         SET dispatch_state = 'DISPATCHING',
             claimed_by = $2,
             claimed_at = $3,
             updated_at = $3
         WHERE id = $1 AND dispatch_state = 'PREPARED'
         RETURNING *`,
        [input.operationId, input.claimant, now],
      );

      if ((updated.rowCount ?? 0) !== 1) {
        return {
          ok: false,
          error: new DomainError(
            "OPERATION_ALREADY_CLAIMED",
            "The operation was claimed by another dispatcher.",
          ),
        };
      }

      await appendAuditEvent(client, {
        incidentId: attempt.incidentId,
        actor: input.claimant,
        eventType: "DISPATCH_CLAIMED",
        correlationId,
        safeDetails: {
          operationId: attempt.id,
          requestId: attempt.requestId,
          previousState: attempt.dispatchState,
        },
        now,
      });

      const claimed = mapAttempt(updated.rows[0]);
      return {
        ok: true,
        value: {
          operation: claimed,
          payload: asPayload(claimed.payload),
        },
      };
    },
  );

  if (!result.ok) throw result.error;
  return result.value;
}

export type MarkAcknowledgedInput = {
  operationId: string;
  claimant: string;
  providerId: string;
  providerStatus: ProviderStatus;
  failureCode?: string | null;
  failureDetail?: string | null;
  now?: Date;
  correlationId?: string;
};

export async function markDispatchAcknowledged(
  input: MarkAcknowledgedInput,
): Promise<AttemptRecord> {
  const providerStatus = providerStatusSchema.parse(input.providerStatus);
  const now = input.now ?? new Date();
  const correlationId = input.correlationId ?? randomUUID();

  const result = await withTransaction<TxResult<AttemptRecord>>(
    async (client) => {
      const attempt = await getAttemptForUpdate(client, input.operationId);

      if (!attempt) {
        return {
          ok: false,
          error: new DomainError(
            "OPERATION_NOT_FOUND",
            "The operation was not found.",
            404,
          ),
        };
      }

      if (
        attempt.dispatchState !== "DISPATCHING" ||
        attempt.claimedBy !== input.claimant
      ) {
        return {
          ok: false,
          error: new DomainError(
            "INVALID_DISPATCH_TRANSITION",
            "Only the current claimant can record an acknowledgement.",
          ),
        };
      }

      const updated = await client.query(
        `UPDATE transfer_attempts
         SET dispatch_state = 'ACKNOWLEDGED',
             provider_id = $2,
             provider_status = $3,
             failure_code = $4,
             failure_detail = $5,
             updated_at = $6
         WHERE id = $1 AND dispatch_state = 'DISPATCHING' AND claimed_by = $7
         RETURNING *`,
        [
          input.operationId,
          input.providerId,
          providerStatus,
          input.failureCode ?? null,
          input.failureDetail ?? null,
          now,
          input.claimant,
        ],
      );

      if ((updated.rowCount ?? 0) !== 1) {
        return {
          ok: false,
          error: new DomainError(
            "INVALID_DISPATCH_TRANSITION",
            "The operation could not be acknowledged.",
          ),
        };
      }

      await appendAuditEvent(client, {
        incidentId: attempt.incidentId,
        actor: input.claimant,
        eventType: "DISPATCH_ACKNOWLEDGED",
        correlationId,
        safeDetails: {
          operationId: attempt.id,
          requestId: attempt.requestId,
          providerStatus,
        },
        now,
      });

      return { ok: true, value: mapAttempt(updated.rows[0]) };
    },
  );

  if (!result.ok) throw result.error;
  return result.value;
}

export type MarkUnknownInput = {
  operationId: string;
  claimant: string;
  reason: string;
  now?: Date;
  correlationId?: string;
};

/**
 * Records that submission may have occurred but the outcome is unknown.
 * The operation remains the only replacement slot; no new payment is created.
 */
export async function markDispatchUnknown(
  input: MarkUnknownInput,
): Promise<AttemptRecord> {
  const now = input.now ?? new Date();
  const correlationId = input.correlationId ?? randomUUID();

  const result = await withTransaction<TxResult<AttemptRecord>>(
    async (client) => {
      const attempt = await getAttemptForUpdate(client, input.operationId);

      if (!attempt) {
        return {
          ok: false,
          error: new DomainError(
            "OPERATION_NOT_FOUND",
            "The operation was not found.",
            404,
          ),
        };
      }

      if (
        attempt.dispatchState !== "DISPATCHING" ||
        attempt.claimedBy !== input.claimant
      ) {
        return {
          ok: false,
          error: new DomainError(
            "INVALID_DISPATCH_TRANSITION",
            "Only the current claimant can mark this operation unknown.",
          ),
        };
      }

      const updated = await client.query(
        `UPDATE transfer_attempts
         SET dispatch_state = 'UNKNOWN', updated_at = $2
         WHERE id = $1 AND dispatch_state = 'DISPATCHING' AND claimed_by = $3
         RETURNING *`,
        [input.operationId, now, input.claimant],
      );

      if ((updated.rowCount ?? 0) !== 1) {
        return {
          ok: false,
          error: new DomainError(
            "INVALID_DISPATCH_TRANSITION",
            "The operation could not be marked unknown.",
          ),
        };
      }

      await updateIncidentProjection(
        client,
        attempt.incidentId,
        "ESCALATED",
        POLICY_VERSION,
        now,
      );

      await appendAuditEvent(client, {
        incidentId: attempt.incidentId,
        actor: input.claimant,
        eventType: "DISPATCH_UNKNOWN",
        correlationId,
        safeDetails: {
          operationId: attempt.id,
          requestId: attempt.requestId,
          reason: input.reason,
        },
        now,
      });

      return { ok: true, value: mapAttempt(updated.rows[0]) };
    },
  );

  if (!result.ok) throw result.error;
  return result.value;
}

export type ReconciliationTarget = {
  operationId: string;
  requestId: string;
  providerId: string | null;
  dispatchState: AttemptRecord["dispatchState"];
  providerStatus: AttemptRecord["providerStatus"];
  claimedBy: string | null;
};

/**
 * Returns the stored request ID for reconciliation. It never creates a new
 * attempt and never changes the replacement slot.
 */
export async function getReconciliationTarget(
  operationId: string,
): Promise<ReconciliationTarget> {
  return withTransaction(async (client) => {
    const attempt = await getAttemptById(client, operationId);

    if (!attempt) {
      throw new DomainError(
        "OPERATION_NOT_FOUND",
        "The operation was not found.",
        404,
      );
    }

    return {
      operationId: attempt.id,
      requestId: attempt.requestId,
      providerId: attempt.providerId,
      dispatchState: attempt.dispatchState,
      providerStatus: attempt.providerStatus,
      claimedBy: attempt.claimedBy,
    };
  });
}
