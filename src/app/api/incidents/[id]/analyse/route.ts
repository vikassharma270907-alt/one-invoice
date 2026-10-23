import { NextResponse } from "next/server";

import { getIncidentById } from "@/server/fixtures/incident";
import { analyseComplaint } from "@/server/model/analyse-complaint";
import { evaluatePolicy } from "@/server/policy/evaluate";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const incident = getIncidentById(id);

  if (!incident) {
    return NextResponse.json(
      { error: "INCIDENT_NOT_FOUND", id },
      { status: 404 },
    );
  }

  const decision = evaluatePolicy(incident);

  try {
    const analysis = analyseComplaint({
      message: incident.supplierMessage.raw,
      trustedInvoiceReference: incident.invoiceReference,
      evidence: incident.evidence,
      permittedActions: decision.allowedActions,
    });

    return NextResponse.json({
      analysis,
      decision,
      source: "fixture-deterministic",
      liveModel: false,
      liveCalls: false,
    });
  } catch {
    return NextResponse.json(
      {
        error: "ANALYSIS_FAILED",
        detail:
          "The structured analysis was rejected by schema validation. No financial state was changed.",
        liveCalls: false,
      },
      { status: 422 },
    );
  }
}
