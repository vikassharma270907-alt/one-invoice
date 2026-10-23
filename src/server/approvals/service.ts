import { randomUUID } from "node:crypto";

import {
  mapApproval,
  type ApprovalRecord,
} from "@/server/db/records";
import {
  appendAuditEvent,
  loadPolicyContext,
  lockIncident,
  updateIncidentProjection,
} from "@/server/db/queries";
import { withTransaction } from "@/server/db/pool";
import { DomainError, isPgUniqueViolation } from "@/server/domain/errors";
import { evaluatePolicyFacts } from "@/server/policy/evaluate";

import {
  buildApprovalTerms,
  hashApprovalTerms,
} from "./terms";

const DEFAULT_EXPIRY_SECONDS = 300;

type TxResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: DomainError };

export type CreateApprovalInput = {
  incidentId: string;
  approver: string;
  now?: Date;
  expiresInSeconds?: number;
  correlationId?: string;
};

/**
 * Creates an approval bound to the current exact terms. The caller cannot
 * choose the amount, payee, request ID, evidence version, or policy version.
 */
export async function createApproval(
  input: CreateApprovalInput,
): Promise<ApprovalRecord> {
  if (!input.approver.trim()) {
    throw new DomainError("APPROVER_REQUIRED", "An approver is required.");
  }

  const now = input.now ?? new Date();
  const expiresInSeconds = input.expiresInSeconds ?? DEFAULT_EXPIRY_SECONDS;

  if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new DomainError(
      "INVALID_APPROVAL_EXPIRY",
      "Approval expiry must be a positive number of seconds.",
    );
  }

  const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000);
  const correlationId = input.correlationId ?? randomUUID();

  try {
    const result = await withTransaction<TxResult<ApprovalRecord>>(
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
            actor: input.approver,
            eventType: "APPROVAL_BLOCKED",
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
              "POLICY_BLOCKS_APPROVAL",
              decision.reasons.join(" "),
            ),
          };
        }

        const terms = buildApprovalTerms({
          incident,
          obligation: context.obligation,
          facts: context.facts,
          decision,
        });
        const termsHash = hashApprovalTerms(terms);
        const approvalId = `apr_${randomUUID()}`;

        const inserted = await client.query(
          `INSERT INTO approvals
             (id, incident_id, approver, terms_hash, terms, evidence_version,
              policy_version, expires_at, state, reserved_at, consumed_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, 'RESERVED', $9, NULL)
           RETURNING *`,
          [
            approvalId,
            incident.id,
            input.approver,
            termsHash,
            JSON.stringify(terms),
            decision.evidenceVersion,
            decision.policyVersion,
            expiresAt,
            now,
          ],
        );

        await appendAuditEvent(client, {
          incidentId: incident.id,
          actor: input.approver,
          eventType: "APPROVAL_CREATED",
          correlationId,
          safeDetails: {
            approvalId,
            evidenceVersion: decision.evidenceVersion,
            policyVersion: decision.policyVersion,
            termsHash,
            expiresAt: expiresAt.toISOString(),
          },
          now,
        });

        return { ok: true, value: mapApproval(inserted.rows[0]) };
      },
    );

    if (!result.ok) throw result.error;
    return result.value;
  } catch (error) {
    if (isPgUniqueViolation(error, "approvals_one_active_per_incident")) {
      throw new DomainError(
        "ACTIVE_APPROVAL_EXISTS",
        "An active approval already exists for this incident.",
      );
    }
    throw error;
  }
}
