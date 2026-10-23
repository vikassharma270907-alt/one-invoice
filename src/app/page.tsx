import { IncidentWorkspace } from "@/components/incident-workspace";
import { integrationStatus } from "@/server/config";
import { getIncidentFixture } from "@/server/fixtures/incident";
import { analyseComplaint } from "@/server/model/analyse-complaint";
import { evaluatePolicy } from "@/server/policy/evaluate";

export default function Home() {
  const incident = getIncidentFixture();
  const decision = evaluatePolicy(incident);
  const initialAnalysis = analyseComplaint({
    message: incident.supplierMessage.raw,
    trustedInvoiceReference: incident.invoiceReference,
    evidence: incident.evidence,
    permittedActions: decision.allowedActions,
  });

  return (
    <IncidentWorkspace
      incident={incident}
      decision={decision}
      initialAnalysis={initialAnalysis}
      integrationStatus={integrationStatus}
    />
  );
}
