import type {
  Action,
  Incident,
  IncidentState,
  ProviderStatus,
} from "@/server/schemas/incident";

export const POLICY_VERSION = "demo-policy-v0.1";

/**
 * Fixture-only. This is NOT an Airwallex failure-code allowlist.
 *
 * The real replaceable-failure allowlist must be established from current
 * official documentation and an authorised sandbox test. Until then, this
 * value is used only to exercise the local policy tests.
 */
export const FIXTURE_REPLACEABLE_FAILURE_CODES = [
  "DEMO_SYNTHETIC_FAILURE",
] as const;

export type PolicyFacts = {
  obligation: {
    amountMinor: number;
    currency: "USD";
    feeAllowanceMinor: number;
    beneficiaryFingerprint: string;
  };
  evidence: {
    id: string;
    providerStatus: ProviderStatus;
    providerRequestId: string | null;
    providerTransferId: string | null;
    availableBalanceMinor: number;
    currency: "USD";
    beneficiaryFingerprint: string;
    amountMinor: number;
    failureCode: string | null;
  };
  attempts: Array<{
    kind: "ORIGINAL" | "REPLACEMENT";
    requestId: string;
    providerId: string | null;
  }>;
};

export type PolicyDecision = {
  state: IncidentState;
  allowedActions: Action[];
  blockedActions: Action[];
  reasons: string[];
  replacementAllowed: boolean;
  requiresApproval: boolean;
  evidenceVersion: string;
  policyVersion: string;
};

const ALL_ACTIONS: Action[] = [
  "WAIT",
  "ESCALATE",
  "PREPARE_REPLACEMENT",
  "APPROVE",
  "EXECUTE",
];

function blockedExcept(allowed: Action[]): Action[] {
  return ALL_ACTIONS.filter((action) => !allowed.includes(action));
}

function decision(
  evidenceVersion: string,
  state: IncidentState,
  allowedActions: Action[],
  reasons: string[],
  options: { replacementAllowed?: boolean; requiresApproval?: boolean } = {},
): PolicyDecision {
  return {
    state,
    allowedActions,
    blockedActions: blockedExcept(allowedActions),
    reasons,
    replacementAllowed: options.replacementAllowed ?? false,
    requiresApproval: options.requiresApproval ?? false,
    evidenceVersion,
    policyVersion: POLICY_VERSION,
  };
}

export function evaluatePolicyFacts(facts: PolicyFacts): PolicyDecision {
  const { evidence, obligation, attempts } = facts;
  const original = attempts.find((attempt) => attempt.kind === "ORIGINAL");
  const replacement = attempts.find((attempt) => attempt.kind === "REPLACEMENT");
  const evidenceVersion = evidence.id;

  if (!original) {
    return decision(
      evidenceVersion,
      "ESCALATED",
      ["ESCALATE"],
      ["No original transfer is recorded for this obligation."],
    );
  }

  if (replacement) {
    return decision(
      evidenceVersion,
      "ESCALATED",
      ["WAIT", "ESCALATE"],
      [
        "The single replacement slot for this obligation has already been used.",
        "A further attempt requires operator investigation, not another automatic payment.",
      ],
    );
  }

  if (evidence.currency !== obligation.currency) {
    return decision(
      evidenceVersion,
      "ESCALATED",
      ["ESCALATE"],
      ["The evidence currency does not match the trusted obligation."],
    );
  }

  if (evidence.amountMinor !== obligation.amountMinor) {
    return decision(
      evidenceVersion,
      "ESCALATED",
      ["ESCALATE"],
      ["The evidence amount does not match the trusted obligation."],
    );
  }

  if (evidence.beneficiaryFingerprint !== obligation.beneficiaryFingerprint) {
    return decision(
      evidenceVersion,
      "ESCALATED",
      ["ESCALATE"],
      ["The evidence payee fingerprint does not match the approved beneficiary."],
    );
  }

  if (
    evidence.providerRequestId !== null &&
    evidence.providerRequestId !== original.requestId
  ) {
    return decision(
      evidenceVersion,
      "ESCALATED",
      ["ESCALATE"],
      ["The evidence request ID does not match the recorded original request."],
    );
  }

  if (
    evidence.providerTransferId !== null &&
    original.providerId !== null &&
    evidence.providerTransferId !== original.providerId
  ) {
    return decision(
      evidenceVersion,
      "ESCALATED",
      ["ESCALATE"],
      ["The evidence transfer ID does not match the recorded original transfer."],
    );
  }

  switch (evidence.providerStatus) {
    case "PAID":
      return decision(
        evidenceVersion,
        "ORIGINAL_PAID",
        ["WAIT", "ESCALATE"],
        [
          "The original transfer is recorded as PAID.",
          "No replacement may be prepared while the trusted record shows a successful payment.",
        ],
      );

    case "SENT":
      return decision(
        evidenceVersion,
        "ORIGINAL_SENT",
        ["WAIT", "ESCALATE"],
        [
          "The original transfer is still SENT.",
          "A replacement is blocked until a tested terminal failure is confirmed.",
        ],
      );

    case "UNKNOWN":
      return decision(
        evidenceVersion,
        "ESCALATED",
        ["WAIT", "ESCALATE"],
        [
          "The original transfer outcome is unresolved.",
          "Do not create another payment from an uncertain result.",
        ],
      );

    case "CANCELLED":
      return decision(
        evidenceVersion,
        "ESCALATED",
        ["ESCALATE"],
        [
          "A bare CANCELLED status is not sufficient evidence of a replaceable failure.",
          "Escalate for operator review.",
        ],
      );

    case "FAILED": {
      if (
        evidence.failureCode === null ||
        !FIXTURE_REPLACEABLE_FAILURE_CODES.includes(
          evidence.failureCode as (typeof FIXTURE_REPLACEABLE_FAILURE_CODES)[number],
        )
      ) {
        return decision(
          evidenceVersion,
          "ESCALATED",
          ["ESCALATE"],
          [
            "The failure code is missing or is not on the fixture-only allowlist.",
            "No replacement may be prepared from an unverified failure.",
          ],
        );
      }

      const requiredMinor =
        obligation.amountMinor + obligation.feeAllowanceMinor;
      if (evidence.availableBalanceMinor < requiredMinor) {
        return decision(
          evidenceVersion,
          "ESCALATED",
          ["ESCALATE"],
          [
            "The available balance does not cover the amount plus the fee allowance.",
            "No replacement may be prepared.",
          ],
        );
      }

      return decision(
        evidenceVersion,
        "FAILURE_CONFIRMED_REPLACEABLE",
        ["WAIT", "ESCALATE", "PREPARE_REPLACEMENT"],
        [
          "A fixture-only allowlisted failure is confirmed by the stored evidence.",
          "A human must approve the exact replacement terms before any execution.",
        ],
        { replacementAllowed: true, requiresApproval: true },
      );
    }

    default:
      return decision(
        evidenceVersion,
        "ESCALATED",
        ["ESCALATE"],
        ["The provider status is not recognised by this policy version."],
      );
  }
}

export function evaluatePolicy(incident: Incident): PolicyDecision {
  return evaluatePolicyFacts({
    obligation: {
      amountMinor: incident.obligation.amountMinor,
      currency: incident.obligation.currency,
      feeAllowanceMinor: incident.obligation.feeAllowanceMinor,
      beneficiaryFingerprint: incident.obligation.beneficiary.fingerprint,
    },
    evidence: {
      id: incident.evidence.id,
      providerStatus: incident.evidence.providerStatus,
      providerRequestId: incident.evidence.providerRequestId,
      providerTransferId: incident.evidence.providerTransferId,
      availableBalanceMinor: incident.evidence.availableBalanceMinor,
      currency: incident.evidence.currency,
      beneficiaryFingerprint: incident.evidence.beneficiaryFingerprint,
      amountMinor: incident.evidence.amountMinor,
      failureCode: incident.evidence.failureCode,
    },
    attempts: incident.attempts.map((attempt) => ({
      kind: attempt.kind,
      requestId: attempt.requestId,
      providerId: attempt.providerId,
    })),
  });
}
