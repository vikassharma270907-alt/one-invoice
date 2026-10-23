import { describe, expect, it } from "vitest";

import rawIncident from "../fixtures/synthetic/incident.json";
import {
  FIXTURE_REPLACEABLE_FAILURE_CODES,
  evaluatePolicy,
} from "@/server/policy/evaluate";
import {
  incidentSchema,
  type Incident,
} from "@/server/schemas/incident";

const baseIncident = incidentSchema.parse(rawIncident);

function cloneIncident(): Incident {
  return structuredClone(baseIncident);
}

function withFailedEvidence(incident: Incident): Incident {
  incident.state = "FAILURE_CONFIRMED_REPLACEABLE";
  incident.evidence.providerStatus = "FAILED";
  incident.evidence.failureCode = FIXTURE_REPLACEABLE_FAILURE_CODES[0];
  incident.evidence.failureDetail = "Synthetic fixture failure for policy tests.";
  incident.attempts[0].providerStatus = "FAILED";
  incident.attempts[0].failureCode = FIXTURE_REPLACEABLE_FAILURE_CODES[0];
  return incident;
}

describe("evaluatePolicy", () => {
  it("blocks a replacement while the original is SENT", () => {
    const decision = evaluatePolicy(cloneIncident());

    expect(decision.state).toBe("ORIGINAL_SENT");
    expect(decision.allowedActions).toEqual(["WAIT", "ESCALATE"]);
    expect(decision.blockedActions).toContain("PREPARE_REPLACEMENT");
    expect(decision.replacementAllowed).toBe(false);
    expect(decision.requiresApproval).toBe(false);
  });

  it("blocks a replacement when the original is PAID", () => {
    const incident = cloneIncident();
    incident.state = "ORIGINAL_PAID";
    incident.evidence.providerStatus = "PAID";
    incident.attempts[0].providerStatus = "PAID";

    const decision = evaluatePolicy(incident);

    expect(decision.state).toBe("ORIGINAL_PAID");
    expect(decision.replacementAllowed).toBe(false);
    expect(decision.blockedActions).toContain("PREPARE_REPLACEMENT");
    expect(decision.reasons.join(" ")).toMatch(/PAID/);
  });

  it("escalates an unresolved original instead of paying again", () => {
    const incident = cloneIncident();
    incident.evidence.providerStatus = "UNKNOWN";
    incident.attempts[0].providerStatus = "UNKNOWN";

    const decision = evaluatePolicy(incident);

    expect(decision.state).toBe("ESCALATED");
    expect(decision.allowedActions).toContain("ESCALATE");
    expect(decision.replacementAllowed).toBe(false);
    expect(decision.reasons.join(" ")).toMatch(/unresolved/i);
  });

  it("treats bare CANCELLED as insufficient for a replacement", () => {
    const incident = cloneIncident();
    incident.evidence.providerStatus = "CANCELLED";
    incident.attempts[0].providerStatus = "CANCELLED";

    const decision = evaluatePolicy(incident);

    expect(decision.state).toBe("ESCALATED");
    expect(decision.allowedActions).toEqual(["ESCALATE"]);
    expect(decision.replacementAllowed).toBe(false);
  });

  it("allows preparation after a fixture-only allowlisted failure", () => {
    const decision = evaluatePolicy(withFailedEvidence(cloneIncident()));

    expect(decision.state).toBe("FAILURE_CONFIRMED_REPLACEABLE");
    expect(decision.allowedActions).toContain("PREPARE_REPLACEMENT");
    expect(decision.blockedActions).toContain("APPROVE");
    expect(decision.blockedActions).toContain("EXECUTE");
    expect(decision.replacementAllowed).toBe(true);
    expect(decision.requiresApproval).toBe(true);
  });

  it("blocks an unrecognised failure code", () => {
    const incident = withFailedEvidence(cloneIncident());
    incident.evidence.failureCode = "SOME_UNVERIFIED_FAILURE";

    const decision = evaluatePolicy(incident);

    expect(decision.state).toBe("ESCALATED");
    expect(decision.replacementAllowed).toBe(false);
  });

  it("blocks a replacement when available balance is insufficient", () => {
    const incident = withFailedEvidence(cloneIncident());
    incident.evidence.availableBalanceMinor = 9999;

    const decision = evaluatePolicy(incident);

    expect(decision.state).toBe("ESCALATED");
    expect(decision.replacementAllowed).toBe(false);
    expect(decision.reasons.join(" ")).toMatch(/balance/i);
  });

  it("blocks a second replacement", () => {
    const incident = cloneIncident();
    incident.attempts.push({
      id: "ATT-DEMO-002",
      kind: "REPLACEMENT",
      requestId: "req_demo_replacement_001",
      providerId: "tr_demo_replacement_001",
      providerStatus: "SENT",
      failureCode: null,
      failureDetail: null,
      dispatchState: "ACKNOWLEDGED",
      approvedPayloadHash: "fixture-hash-replacement",
    });

    const decision = evaluatePolicy(incident);

    expect(decision.state).toBe("ESCALATED");
    expect(decision.replacementAllowed).toBe(false);
    expect(decision.reasons.join(" ")).toMatch(/single replacement slot/i);
  });

  it("escalates when the evidence payee does not match the obligation", () => {
    const incident = cloneIncident();
    incident.evidence.beneficiaryFingerprint = "demo:ben:different";

    const decision = evaluatePolicy(incident);

    expect(decision.state).toBe("ESCALATED");
    expect(decision.allowedActions).toEqual(["ESCALATE"]);
    expect(decision.reasons.join(" ")).toMatch(/payee fingerprint/i);
  });

  it("escalates when the evidence amount does not match the obligation", () => {
    const incident = cloneIncident();
    incident.evidence.amountMinor = 9999;

    const decision = evaluatePolicy(incident);

    expect(decision.state).toBe("ESCALATED");
    expect(decision.reasons.join(" ")).toMatch(/amount/i);
  });

  it("escalates when the evidence currency does not match the obligation", () => {
    const incident = cloneIncident();
    // Bypass the schema type for this defensive policy test.
    incident.evidence.currency = "EUR" as "USD";

    const decision = evaluatePolicy(incident);

    expect(decision.state).toBe("ESCALATED");
    expect(decision.reasons.join(" ")).toMatch(/currency/i);
  });

  it("escalates when the evidence request ID does not match the original", () => {
    const incident = cloneIncident();
    incident.evidence.providerRequestId = "req_demo_different";

    const decision = evaluatePolicy(incident);

    expect(decision.state).toBe("ESCALATED");
    expect(decision.reasons.join(" ")).toMatch(/request ID/i);
  });

  it("escalates when no original attempt is recorded", () => {
    const incident = cloneIncident();
    incident.attempts = [
      {
        ...incident.attempts[0],
        kind: "REPLACEMENT",
        id: "ATT-DEMO-REPLACEMENT",
      },
    ];

    const decision = evaluatePolicy(incident);

    expect(decision.state).toBe("ESCALATED");
    expect(decision.allowedActions).toEqual(["ESCALATE"]);
    expect(decision.replacementAllowed).toBe(false);
  });
});
