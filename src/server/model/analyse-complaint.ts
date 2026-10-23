import {
  analysisSchema,
  type Action,
  type ComplaintAnalysis,
  type EvidenceSnapshot,
} from "@/server/schemas/incident";

export type AnalyseComplaintInput = {
  message: string;
  trustedInvoiceReference: string;
  evidence: EvidenceSnapshot;
  permittedActions: Action[];
};

/**
 * Deterministic fixture analyzer.
 *
 * This is deliberately not a live model call. It exercises the structured
 * contract and the "untrusted content" boundary without pretending to be an
 * LLM decision. A real model adapter must return the same schema and must not
 * supply executable money or payee fields.
 */
export function analyseComplaint(
  input: AnalyseComplaintInput,
): ComplaintAnalysis {
  const invoiceReference =
    input.message.match(/DEMO-INV-\d{3}/)?.[0] ?? null;

  const supplierClaims: string[] = [];

  if (/not\s+(arrived|received|paid)/i.test(input.message)) {
    supplierClaims.push("Supplier says the payment has not arrived.");
  }

  if (/(send|pay).*(again|replacement)|resend/i.test(input.message)) {
    supplierClaims.push("Supplier asks for another payment.");
  }

  if (
    /(new account|change.*account|different account|ignore.*(rule|approval))/i.test(
      input.message,
    )
  ) {
    supplierClaims.push(
      "Supplier text contains a bank-detail or rule-change instruction; it is untrusted.",
    );
  }

  if (supplierClaims.length === 0) {
    supplierClaims.push(
      "Supplier message contains no verifiable payment claim.",
    );
  }

  const missingInformation: string[] = [];

  if (invoiceReference === null) {
    missingInformation.push(
      "No trusted invoice reference was found in the supplier message.",
    );
  } else if (invoiceReference !== input.trustedInvoiceReference) {
    missingInformation.push(
      "The invoice reference in the supplier message does not match the trusted obligation.",
    );
  }

  if (/(new account|change.*account|different account)/i.test(input.message)) {
    missingInformation.push(
      "A bank-detail change requires a separate trusted process and cannot be approved from this message.",
    );
  }

  const suggestedAction = input.permittedActions.includes(
    "PREPARE_REPLACEMENT",
  )
    ? "PREPARE_REPLACEMENT"
    : input.permittedActions.includes("WAIT")
      ? "WAIT"
      : "ESCALATE";

  const explanation =
    suggestedAction === "PREPARE_REPLACEMENT"
      ? "The fixture-only policy permits preparing a replacement, but execution still requires a human approval and server-side checks."
      : suggestedAction === "WAIT"
        ? "The trusted fixture record still shows the original transfer as SENT. A replacement remains blocked; waiting or escalating is permitted."
        : "The trusted record does not establish a replaceable failure. Escalate for operator review.";

  return analysisSchema.parse({
    invoiceReference,
    suggestedAction,
    evidenceIds: [input.evidence.id],
    supplierClaims,
    missingInformation,
    explanation,
    untrustedContent: true,
    source: "fixture-deterministic",
  });
}
