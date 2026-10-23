import { describe, expect, it } from "vitest";

import rawIncident from "../fixtures/synthetic/incident.json";
import {
  analysisSchema,
  incidentSchema,
} from "@/server/schemas/incident";

describe("incident schema", () => {
  it("accepts the synthetic fixture", () => {
    const result = incidentSchema.safeParse(rawIncident);
    expect(result.success).toBe(true);
  });

  it("rejects a non-USD currency", () => {
    const result = incidentSchema.safeParse({
      ...rawIncident,
      obligation: {
        ...rawIncident.obligation,
        currency: "EUR",
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a negative amount", () => {
    const result = incidentSchema.safeParse({
      ...rawIncident,
      obligation: {
        ...rawIncident.obligation,
        amountMinor: -1,
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects an unknown provider status", () => {
    const result = incidentSchema.safeParse({
      ...rawIncident,
      evidence: {
        ...rawIncident.evidence,
        providerStatus: "PROCESSING",
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a live-calls label in the foundation fixture", () => {
    const result = incidentSchema.safeParse({
      ...rawIncident,
      labels: {
        dataSource: "fixture",
        liveCalls: true,
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown top-level fields", () => {
    const result = incidentSchema.safeParse({
      ...rawIncident,
      unexpected: "field",
    });

    expect(result.success).toBe(false);
  });
});

describe("analysis schema", () => {
  const validAnalysis = {
    invoiceReference: "DEMO-INV-001",
    suggestedAction: "WAIT",
    evidenceIds: ["EVD-DEMO-001"],
    supplierClaims: ["Supplier says the payment has not arrived."],
    missingInformation: [],
    explanation: "Fixture explanation.",
    untrustedContent: true,
    source: "fixture-deterministic",
  };

  it("accepts a valid analysis", () => {
    expect(analysisSchema.safeParse(validAnalysis).success).toBe(true);
  });

  it("rejects extra executable fields", () => {
    const result = analysisSchema.safeParse({
      ...validAnalysis,
      amountMinor: 10000,
      beneficiary: "attacker",
      requestId: "req_injected",
    });

    expect(result.success).toBe(false);
  });

  it("requires untrusted content to stay labelled", () => {
    const result = analysisSchema.safeParse({
      ...validAnalysis,
      untrustedContent: false,
    });

    expect(result.success).toBe(false);
  });

  it("rejects an unknown suggested action", () => {
    const result = analysisSchema.safeParse({
      ...validAnalysis,
      suggestedAction: "PAY_NOW",
    });

    expect(result.success).toBe(false);
  });
});
