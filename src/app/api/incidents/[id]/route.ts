import { NextResponse } from "next/server";

import { getIncidentById } from "@/server/fixtures/incident";
import { evaluatePolicy } from "@/server/policy/evaluate";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const incident = getIncidentById(id);

  if (!incident) {
    return NextResponse.json(
      { error: "INCIDENT_NOT_FOUND", id },
      { status: 404 },
    );
  }

  return NextResponse.json({
    incident,
    decision: evaluatePolicy(incident),
    source: "fixture",
    liveCalls: false,
  });
}
