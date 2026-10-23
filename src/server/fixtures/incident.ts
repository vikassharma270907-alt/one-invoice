import "server-only";

import rawIncident from "../../../fixtures/synthetic/incident.json";
import {
  incidentSchema,
  type Incident,
} from "@/server/schemas/incident";

const incident = incidentSchema.parse(rawIncident);

export function getIncidentFixture(): Incident {
  return incident;
}

export function getIncidentById(id: string): Incident | null {
  return incident.id === id ? incident : null;
}
