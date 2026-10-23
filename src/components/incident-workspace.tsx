"use client";

import { useState } from "react";

import type { PolicyDecision } from "@/server/policy/evaluate";
import type {
  ComplaintAnalysis,
  Incident,
} from "@/server/schemas/incident";

import styles from "./incident-workspace.module.css";

type IntegrationStatus = {
  airwallex: string;
  database: string;
  model: string;
  liveCallsEnabled: boolean;
  verifiedCalls: number;
};

type IncidentWorkspaceProps = {
  incident: Incident;
  decision: PolicyDecision;
  initialAnalysis: ComplaintAnalysis;
  integrationStatus: IntegrationStatus;
};

const stateLabels: Record<Incident["state"], string> = {
  ORIGINAL_SENT: "Original sent — replacement blocked",
  ORIGINAL_PAID: "Original paid — replacement blocked",
  FAILURE_CONFIRMED_REPLACEABLE:
    "Failure confirmed — replacement may be prepared",
  ESCALATED: "Escalated — operator review",
  RECONCILED: "Reconciled",
};

const actionLabels: Record<PolicyDecision["allowedActions"][number], string> = {
  WAIT: "Wait",
  ESCALATE: "Escalate",
  PREPARE_REPLACEMENT: "Prepare replacement",
  APPROVE: "Approve exact terms",
  EXECUTE: "Execute approved replacement",
};

function formatMinor(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function formatTimestamp(value: string): string {
  return `${new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}

export function IncidentWorkspace({
  incident,
  decision,
  initialAnalysis,
  integrationStatus,
}: IncidentWorkspaceProps) {
  const [analysis, setAnalysis] = useState(initialAnalysis);
  const [analysing, setAnalysing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const amount = formatMinor(
    incident.obligation.amountMinor,
    incident.obligation.currency,
  );
  const feeAllowance = formatMinor(
    incident.obligation.feeAllowanceMinor,
    incident.obligation.currency,
  );
  const available = formatMinor(
    incident.evidence.availableBalanceMinor,
    incident.evidence.currency,
  );

  async function handleAnalyse() {
    setAnalysing(true);
    setAnalysisError(null);

    try {
      const response = await fetch(
        `/api/incidents/${incident.id}/analyse`,
        { method: "POST" },
      );
      const payload = (await response.json()) as {
        analysis?: ComplaintAnalysis;
        error?: string;
        detail?: string;
      };

      if (!response.ok || !payload.analysis) {
        throw new Error(
          payload.detail ?? payload.error ?? "Analysis failed",
        );
      }

      setAnalysis(payload.analysis);
    } catch (error) {
      setAnalysisError(
        error instanceof Error ? error.message : "Analysis failed",
      );
    } finally {
      setAnalysing(false);
    }
  }

  return (
    <div className={styles.workspace}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <div className={styles.brandMark} aria-hidden="true">
            1
          </div>
          <div>
            <p className={styles.eyebrow}>
              Airwallex Agentic Banking · Track 3 concept
            </p>
            <h1>ONE INVOICE</h1>
            <p className={styles.tagline}>
              One invoice. One successful payment.
            </p>
          </div>
        </div>
        <div className={styles.topbarMeta}>
          <span className={styles.badge}>SANDBOX</span>
          <span className={`${styles.badge} ${styles.badgeAmber}`}>
            FIXTURE DATA
          </span>
          <span className={`${styles.badge} ${styles.badgeGood}`}>
            NO LIVE CALLS
          </span>
        </div>
      </header>

      <div className={styles.notice} role="note">
        <strong>Foundation build.</strong> This screen is read-only synthetic
        data. No Airwallex call, approval, or money movement is implemented.
      </div>

      <section className={styles.incidentHeader} aria-labelledby="incident-title">
        <div className={styles.incidentTitle}>
          <div>
            <p className={styles.sectionKicker}>Incident workspace</p>
            <h2 id="incident-title">{incident.invoiceReference}</h2>
            <p className={styles.subtle}>
              {incident.companyName} · obligation{" "}
              <span className={styles.mono}>{incident.obligation.id}</span>
            </p>
          </div>
          <div className={styles.amountBlock}>
            <span className={styles.amount}>{amount}</span>
            <span className={styles.subtle}>
              {incident.obligation.currency} · fee allowance {feeAllowance}
            </span>
          </div>
        </div>

        <div className={styles.incidentFacts}>
          <div className={styles.fact}>
            <span className={styles.factLabel}>Trusted payee</span>
            <span>{incident.obligation.beneficiary.alias}</span>
            <span className={styles.mono}>
              {incident.obligation.beneficiary.fingerprint}
            </span>
          </div>
          <div className={styles.fact}>
            <span className={styles.factLabel}>App state</span>
            <span className={styles.statePill}>
              {stateLabels[incident.state]}
            </span>
          </div>
          <div className={styles.fact}>
            <span className={styles.factLabel}>Original request</span>
            <span className={styles.mono}>
              {incident.attempts[0]?.requestId ?? "—"}
            </span>
          </div>
          <div className={styles.fact}>
            <span className={styles.factLabel}>Data source</span>
            <span>
              {incident.evidence.source.toUpperCase()} · live calls{" "}
              {incident.labels.liveCalls ? "on" : "off"}
            </span>
          </div>
        </div>
      </section>

      <div className={styles.grid}>
        <div className={styles.mainColumn}>
          <section className={styles.card} aria-labelledby="message-title">
            <div className={styles.cardHead}>
              <div>
                <p className={styles.sectionKicker}>01 · Supplier message</p>
                <h3 id="message-title">What the supplier said</h3>
              </div>
              <span className={`${styles.badge} ${styles.badgeAmber}`}>
                UNTRUSTED SUPPLIER CONTENT
              </span>
            </div>

            <blockquote className={styles.message}>
              {incident.supplierMessage.raw}
            </blockquote>
            <p className={styles.subtle}>
              Received {formatTimestamp(incident.supplierMessage.receivedAt)}.
              The message is data, not policy. It cannot change the payee,
              amount, or approval rule.
            </p>

            <div className={styles.twoCol}>
              <div>
                <h4 className={styles.miniHeading}>Extracted claims</h4>
                <ul className={styles.list}>
                  {analysis.supplierClaims.map((claim) => (
                    <li key={claim}>{claim}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className={styles.miniHeading}>Missing or blocked</h4>
                {analysis.missingInformation.length > 0 ? (
                  <ul className={styles.list}>
                    {analysis.missingInformation.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.subtle}>
                    No missing information for this fixture.
                  </p>
                )}
              </div>
            </div>

            <div className={styles.analysisBar} aria-live="polite">
              <div>
                <span className={styles.factLabel}>Analysis source</span>
                <span className={styles.mono}>{analysis.source}</span>
              </div>
              <button
                type="button"
                className={styles.button}
                onClick={handleAnalyse}
                disabled={analysing}
                data-testid="analyse-complaint"
              >
                {analysing ? "Analysing…" : "Re-analyse complaint"}
              </button>
            </div>
            {analysisError ? (
              <p className={styles.error} role="alert">
                {analysisError}
              </p>
            ) : null}
          </section>

          <section className={styles.card} aria-labelledby="evidence-title">
            <div className={styles.cardHead}>
              <div>
                <p className={styles.sectionKicker}>02 · Evidence</p>
                <h3 id="evidence-title">Trusted payment record</h3>
              </div>
              <span className={styles.badge}>
                {incident.evidence.source.toUpperCase()}
              </span>
            </div>

            <div className={styles.evidenceGrid}>
              <div className={styles.evidenceItem}>
                <span className={styles.factLabel}>Provider status</span>
                <span className={styles.statusValue}>
                  {incident.evidence.providerStatus}
                </span>
              </div>
              <div className={styles.evidenceItem}>
                <span className={styles.factLabel}>Available balance</span>
                <span>{available}</span>
              </div>
              <div className={styles.evidenceItem}>
                <span className={styles.factLabel}>Transfer ID</span>
                <span className={styles.mono}>
                  {incident.evidence.providerTransferId ?? "—"}
                </span>
              </div>
              <div className={styles.evidenceItem}>
                <span className={styles.factLabel}>Request ID</span>
                <span className={styles.mono}>
                  {incident.evidence.providerRequestId ?? "—"}
                </span>
              </div>
              <div className={styles.evidenceItem}>
                <span className={styles.factLabel}>Failure code</span>
                <span className={styles.mono}>
                  {incident.evidence.failureCode ?? "none"}
                </span>
              </div>
              <div className={styles.evidenceItem}>
                <span className={styles.factLabel}>Last evidence read</span>
                <span>{formatTimestamp(incident.evidence.fetchedAt)}</span>
              </div>
            </div>

            <p className={styles.evidenceNote}>
              {incident.evidence.notes} A stored fixture is not a fresh provider
              read.
            </p>

            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.button}
                disabled
                title="Not implemented in the foundation. No live provider read is made."
              >
                Refresh evidence
              </button>
              <span className={styles.subtle}>
                Live refresh is intentionally disabled.
              </span>
            </div>
          </section>

          <section className={styles.card} aria-labelledby="decision-title">
            <div className={styles.cardHead}>
              <div>
                <p className={styles.sectionKicker}>03 · Decision</p>
                <h3 id="decision-title">What is permitted now</h3>
              </div>
              <span className={styles.badge}>{decision.policyVersion}</span>
            </div>

            <div className={styles.decisionBanner}>
              <div>
                <span className={styles.factLabel}>Policy conclusion</span>
                <strong data-testid="decision-state">
                  {stateLabels[decision.state]}
                </strong>
              </div>
              <span className={styles.mono}>
                evidence {decision.evidenceVersion}
              </span>
            </div>

            <div className={styles.twoCol}>
              <div>
                <h4 className={styles.miniHeading}>Allowed</h4>
                <div className={styles.chips}>
                  {decision.allowedActions.map((action) => (
                    <span
                      key={action}
                      className={`${styles.chip} ${styles.chipAllowed}`}
                    >
                      {actionLabels[action]}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <h4 className={styles.miniHeading}>Blocked</h4>
                <div className={styles.chips}>
                  {decision.blockedActions.map((action) => (
                    <span
                      key={action}
                      className={`${styles.chip} ${styles.chipBlocked}`}
                    >
                      {actionLabels[action]}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <h4 className={styles.miniHeading}>Backend reasons</h4>
            <ul className={styles.list}>
              {decision.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>

            <div className={styles.proposalBox}>
              <div>
                <span className={styles.factLabel}>
                  Model proposal · fixture analyzer
                </span>
                <strong>{actionLabels[analysis.suggestedAction]}</strong>
              </div>
              <span className={styles.mono}>
                evidence {analysis.evidenceIds.join(", ") || "none"}
              </span>
            </div>
            <p className={styles.subtle}>{analysis.explanation}</p>

            <div className={styles.actionRow}>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                disabled={!decision.replacementAllowed}
                title={
                  decision.replacementAllowed
                    ? "Preparation is implemented in a later milestone."
                    : "Blocked by policy: a replacement cannot be prepared from the current evidence."
                }
              >
                Prepare replacement
              </button>
              <button
                type="button"
                className={styles.button}
                disabled
                title="No approval service is implemented in the foundation."
              >
                Approve exact terms
              </button>
              <button
                type="button"
                className={styles.button}
                disabled
                title="Execution is intentionally unavailable in the foundation."
              >
                Execute approved replacement
              </button>
            </div>
          </section>

          <section className={styles.card} aria-labelledby="timeline-title">
            <div className={styles.cardHead}>
              <div>
                <p className={styles.sectionKicker}>04 · Timeline</p>
                <h3 id="timeline-title">Append-only events</h3>
              </div>
              <span className={styles.badge}>
                {incident.timeline.length} events
              </span>
            </div>
            <ol className={styles.timeline}>
              {incident.timeline.map((event) => (
                <li key={event.id} className={styles.timelineItem}>
                  <span className={styles.timelineDot} aria-hidden="true" />
                  <div>
                    <div className={styles.timelineTop}>
                      <span className={styles.mono}>{event.type}</span>
                      <span className={styles.subtle}>
                        {formatTimestamp(event.at)}
                      </span>
                    </div>
                    <p>{event.summary}</p>
                    <span className={styles.subtle}>
                      {event.actor} · correlation{" "}
                      <span className={styles.mono}>
                        {event.correlationId}
                      </span>
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className={styles.sideColumn}>
          <section className={styles.card} aria-labelledby="approval-title">
            <div className={styles.cardHead}>
              <div>
                <p className={styles.sectionKicker}>Approval panel</p>
                <h3 id="approval-title">Exact terms only</h3>
              </div>
              <span className={`${styles.badge} ${styles.badgeMuted}`}>
                NO APPROVAL
              </span>
            </div>

            <p className={styles.approvalLead}>
              This approval authorises one replacement attempt on these terms
              only.
            </p>

            <dl className={styles.terms}>
              <div>
                <dt>Beneficiary</dt>
                <dd>{incident.obligation.beneficiary.alias}</dd>
              </div>
              <div>
                <dt>Fingerprint</dt>
                <dd className={styles.mono}>
                  {incident.obligation.beneficiary.fingerprint}
                </dd>
              </div>
              <div>
                <dt>Invoice</dt>
                <dd>{incident.invoiceReference}</dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd>{amount}</dd>
              </div>
              <div>
                <dt>Fee allowance</dt>
                <dd>{feeAllowance}</dd>
              </div>
              <div>
                <dt>Original request</dt>
                <dd className={styles.mono}>
                  {incident.evidence.providerRequestId ?? "—"}
                </dd>
              </div>
              <div>
                <dt>Evidence version</dt>
                <dd className={styles.mono}>{decision.evidenceVersion}</dd>
              </div>
              <div>
                <dt>Policy version</dt>
                <dd className={styles.mono}>{decision.policyVersion}</dd>
              </div>
              <div>
                <dt>Expiry</dt>
                <dd>Not issued</dd>
              </div>
            </dl>

            <p className={styles.approvalNote}>
              {decision.replacementAllowed
                ? "A replacement may be prepared, but approval and execution are not implemented in this foundation."
                : "No approval can be prepared while the original is SENT. The server blocks replacement before any approval exists."}
            </p>
          </section>

          <section className={styles.card} aria-labelledby="driver-title">
            <div className={styles.cardHead}>
              <div>
                <p className={styles.sectionKicker}>Separate demo driver</p>
                <h3 id="driver-title">Operator-only boundary</h3>
              </div>
              <span className={`${styles.badge} ${styles.badgeAmber}`}>
                NOT IMPLEMENTED
              </span>
            </div>
            <p className={styles.subtle}>
              Funding, transfer simulation, and failure-injection controls are
              intentionally absent. The model has no route that can create the
              facts used to justify a payment.
            </p>
            <button
              type="button"
              className={styles.button}
              disabled
              title="Demo-driver routes are not implemented in the foundation."
            >
              Open demo driver
            </button>
          </section>

          <section className={styles.card} aria-labelledby="status-title">
            <div className={styles.cardHead}>
              <div>
                <p className={styles.sectionKicker}>Integration status</p>
                <h3 id="status-title">Honest boundaries</h3>
              </div>
              <span className={`${styles.badge} ${styles.badgeMuted}`}>
                0 VERIFIED CALLS
              </span>
            </div>
            <dl className={styles.statusList}>
              <div>
                <dt>Airwallex</dt>
                <dd>{integrationStatus.airwallex}</dd>
              </div>
              <div>
                <dt>Database</dt>
                <dd>{integrationStatus.database}</dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>{integrationStatus.model}</dd>
              </div>
              <div>
                <dt>Live calls</dt>
                <dd>
                  {integrationStatus.liveCallsEnabled ? "enabled" : "disabled"}
                </dd>
              </div>
              <div>
                <dt>Verified calls</dt>
                <dd>{integrationStatus.verifiedCalls}</dd>
              </div>
            </dl>
            <p className={styles.subtle}>
              A configured environment variable does not prove provider access.
              Every authenticated call remains unconfirmed until tested.
            </p>
          </section>
        </aside>
      </div>

      <footer className={styles.footer}>
        <span>
          <strong>One Invoice</strong> · synthetic sandbox concept · not
          production banking software.
        </span>
        <span>
          Fresh build. No BeyondFlow or ArmorIQ code. No live provider calls.
        </span>
      </footer>
    </div>
  );
}
