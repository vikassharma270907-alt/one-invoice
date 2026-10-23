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

type IconName =
  | "activity"
  | "alert"
  | "approval"
  | "arrow"
  | "check"
  | "database"
  | "file"
  | "folder"
  | "history"
  | "info"
  | "lock"
  | "refresh"
  | "shield"
  | "terminal";

const stateLabels: Record<Incident["state"], string> = {
  ORIGINAL_SENT: "Original sent — replacement blocked",
  ORIGINAL_PAID: "Original paid — replacement blocked",
  FAILURE_CONFIRMED_REPLACEABLE:
    "Failure confirmed — replacement may be prepared",
  REPLACEMENT_PREPARED: "Replacement prepared — awaiting dispatch",
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
  const seconds = new Date(value).getUTCSeconds();

  return `${new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: seconds === 0 ? undefined : "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}

function statusTone(value: string): string {
  if (
    value === "disabled" ||
    value.includes("NOT_CONFIGURED") ||
    value.includes("CONFIGURED_UNVERIFIED")
  ) {
    return styles.statusWarn;
  }

  if (value.includes("FIXTURE_ONLY")) {
    return styles.statusInfo;
  }

  return styles.statusGood;
}

function Icon({
  name,
  size = 16,
}: {
  name: IconName;
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };

  switch (name) {
    case "activity":
      return (
        <svg {...common}>
          <path d="M3 12h4l2.2-6 4.1 12 2.2-6H21" />
        </svg>
      );
    case "alert":
      return (
        <svg {...common}>
          <path d="M12 3 21 20H3L12 3Z" />
          <path d="M12 9v5M12 17.2v.1" />
        </svg>
      );
    case "approval":
      return (
        <svg {...common}>
          <path d="M12 3 19 6v5c0 4.4-2.9 8.4-7 9.5C7.9 19.4 5 15.4 5 11V6l7-3Z" />
          <path d="m9.2 11.7 1.8 1.8 3.8-4.1" />
        </svg>
      );
    case "arrow":
      return (
        <svg {...common}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="m8.4 12.2 2.3 2.3 4.9-5.2" />
        </svg>
      );
    case "database":
      return (
        <svg {...common}>
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
          <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
        </svg>
      );
    case "file":
      return (
        <svg {...common}>
          <path d="M6 3h8l4 4v14H6V3Z" />
          <path d="M14 3v5h5M9 13h6M9 17h6" />
        </svg>
      );
    case "folder":
      return (
        <svg {...common}>
          <path d="M3.5 6.5h5l2 2h10v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V6.5Z" />
        </svg>
      );
    case "history":
      return (
        <svg {...common}>
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5M12 7v5l3 2" />
        </svg>
      );
    case "info":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common}>
          <path d="M20 11a8 8 0 0 0-14.9-4M4 5v5h5" />
          <path d="M4 13a8 8 0 0 0 14.9 4M20 19v-5h-5" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3 19 6v5c0 4.4-2.9 8.4-7 9.5C7.9 19.4 5 15.4 5 11V6l7-3Z" />
        </svg>
      );
    case "terminal":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="m7 9 3 3-3 3M13 15h4" />
        </svg>
      );
  }
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

  const original = incident.attempts.find(
    (attempt) => attempt.kind === "ORIGINAL",
  );
  const originalRequest =
    original?.requestId ?? incident.evidence.providerRequestId ?? "—";
  const originalTransfer =
    original?.providerId ?? incident.evidence.providerTransferId ?? "—";
  const failureConfirmed =
    incident.evidence.providerStatus === "FAILED" &&
    Boolean(incident.evidence.failureCode);
  const approval = incident.approval;

  const stageOneTone =
    incident.state === "ORIGINAL_SENT"
      ? styles.stageActive
      : incident.state === "ORIGINAL_PAID"
        ? styles.stageGood
        : styles.stageAmber;
  const stageTwoTone =
    failureConfirmed || incident.evidence.providerStatus === "FAILED"
      ? styles.stageAmber
      : styles.stageMuted;
  const stageThreeTone = decision.requiresApproval
    ? styles.stageAmber
    : styles.stageLocked;
  const stageFourTone = decision.replacementAllowed
    ? styles.stageMuted
    : styles.stageLocked;

  const stageOneStatus =
    incident.evidence.providerStatus === "SENT"
      ? "SENT (IN-FLIGHT)"
      : incident.evidence.providerStatus;
  const stageTwoStatus = failureConfirmed
    ? (incident.evidence.failureCode ?? "CONFIRMED")
    : incident.evidence.providerStatus === "FAILED"
      ? "UNVERIFIED FAILURE"
      : incident.evidence.providerStatus === "PAID"
        ? "NOT APPLICABLE"
        : "UNCONFIRMED";
  const stageThreeStatus = decision.requiresApproval ? "REQUIRED" : "LOCKED";
  const stageFourStatus = decision.replacementAllowed
    ? "ELIGIBLE · NOT PREPARED"
    : "LOCKED";

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
    <div className={styles.appShell}>
      <aside className={styles.rail}>
        <div className={styles.railBrand}>
          <span className={styles.brandMark} aria-hidden="true">
            1
          </span>
          <span className={styles.railBrandText}>
            <strong>One Invoice</strong>
            <span>Airwallex Sandbox</span>
          </span>
        </div>

        <nav className={styles.railNav} aria-label="Workspace sections">
          <a
            className={`${styles.railLink} ${styles.railLinkActive}`}
            href="#incident"
            aria-current="page"
          >
            <Icon name="shield" size={17} />
            <span className={styles.railLabel}>Incident Workspace</span>
          </a>
          <a className={styles.railLink} href="#evidence">
            <Icon name="folder" size={17} />
            <span className={styles.railLabel}>Evidence Vault</span>
          </a>
          <a className={styles.railLink} href="#approval">
            <Icon name="approval" size={17} />
            <span className={styles.railLabel}>Approvals</span>
          </a>
          <a className={styles.railLink} href="#timeline">
            <Icon name="history" size={17} />
            <span className={styles.railLabel}>Audit Log</span>
          </a>
        </nav>

        <div className={styles.railFooter}>
          <a className={styles.railLink} href="#integration-status">
            <Icon name="activity" size={17} />
            <span className={styles.railLabel}>Integration Health</span>
          </a>
          <div className={styles.railStatus}>
            <span className={styles.pulseDot} aria-hidden="true" />
            <span className={styles.railLabel}>Airwallex Track 3</span>
            <span className={styles.sandboxLabel}>sandbox</span>
          </div>
        </div>
      </aside>

      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div className={styles.topbarTitle}>
            <h1 className={styles.wordmark}>One Invoice</h1>
            <span className={styles.topbarTagline}>
              One invoice. One successful payment.
            </span>
          </div>

          <div className={styles.statusStrip} aria-label="Workspace status">
            <span className={`${styles.statusChip} ${styles.chipSandbox}`}>
              SANDBOX
            </span>
            <span className={styles.statusChip}>FIXTURE DATA</span>
            <span className={`${styles.statusChip} ${styles.chipWarn}`}>
              {integrationStatus.liveCallsEnabled
                ? "LIVE CALLS ENABLED"
                : "NO LIVE CALLS"}
            </span>
            <span className={styles.statusChip}>
              {integrationStatus.verifiedCalls} VERIFIED CALLS
            </span>
          </div>

          <div className={styles.topbarMeta}>
            <span className={styles.sessionBadge}>
              <Icon name="lock" size={12} />
              <span>{incident.id}</span>
              <span className={styles.sessionState}>READ-ONLY</span>
            </span>
          </div>
        </header>

        <main className={styles.main}>
          <section
            className={styles.incidentSummary}
            id="incident"
            aria-labelledby="incident-summary-title"
          >
            <h2 className={styles.visuallyHidden} id="incident-summary-title">
              Incident summary
            </h2>

            <div className={styles.incidentTopline}>
              <div className={styles.incidentIdentity}>
                <span className={styles.microLabel}>Incident ID</span>
                <span className={styles.incidentId}>{incident.id}</span>
              </div>
              <span className={styles.stateBadge}>
                <span className={styles.pulseDot} aria-hidden="true" />
                {stateLabels[incident.state]}
              </span>
              <span className={styles.sourceTag}>
                <Icon name="database" size={12} />
                {incident.evidence.source.toUpperCase()} · live calls off
              </span>
            </div>

            <dl className={styles.incidentMetrics}>
              <div className={styles.metric}>
                <dt>Company</dt>
                <dd>{incident.companyName}</dd>
              </div>
              <div className={styles.metric}>
                <dt>Invoice</dt>
                <dd className={styles.metricMono}>{incident.invoiceReference}</dd>
              </div>
              <div className={styles.metric}>
                <dt>Amount</dt>
                <dd className={styles.metricAmount}>
                  {amount} {incident.obligation.currency}
                </dd>
              </div>
              <div className={styles.metric}>
                <dt>Fee allowance</dt>
                <dd className={styles.metricMono}>{feeAllowance}</dd>
              </div>
              <div className={styles.metric}>
                <dt>Trusted payee</dt>
                <dd>{incident.obligation.beneficiary.alias}</dd>
              </div>
              <div className={styles.metric}>
                <dt>Payee fingerprint</dt>
                <dd>
                  <span className={styles.fingerprint}>
                    {incident.obligation.beneficiary.fingerprint}
                  </span>
                </dd>
              </div>
              <div className={styles.metric}>
                <dt>Original request</dt>
                <dd className={styles.metricMono}>{originalRequest}</dd>
              </div>
              <div className={styles.metric}>
                <dt>Original transfer</dt>
                <dd className={styles.metricMono}>{originalTransfer}</dd>
              </div>
            </dl>

            <p className={styles.scopeNote}>
              <Icon name="info" size={13} />
              <span>
                Fixture-only workspace. No Airwallex call, approval, or money
                movement is available from this screen.
              </span>
            </p>
          </section>

          <section
            className={styles.policyStrip}
            aria-labelledby="policy-strip-title"
          >
            <div className={styles.stripHead}>
              <span id="policy-strip-title">
                Deterministic policy evaluation strip
              </span>
              <span className={styles.stripVersion}>
                POLICY: {decision.policyVersion}
              </span>
            </div>

            <div className={styles.policyStages}>
              <div className={`${styles.stage} ${stageOneTone}`}>
                <div className={styles.stageHead}>
                  <span>1. Original sent</span>
                  <Icon name="refresh" size={13} />
                </div>
                <strong>{stageOneStatus}</strong>
              </div>
              <div className={`${styles.stage} ${stageTwoTone}`}>
                <div className={styles.stageHead}>
                  <span>2. Terminal failure</span>
                  <Icon name={failureConfirmed ? "check" : "alert"} size={13} />
                </div>
                <strong>{stageTwoStatus}</strong>
              </div>
              <div className={`${styles.stage} ${stageThreeTone}`}>
                <div className={styles.stageHead}>
                  <span>3. Exact approval</span>
                  <Icon name="lock" size={13} />
                </div>
                <strong>{stageThreeStatus}</strong>
              </div>
              <div className={`${styles.stage} ${stageFourTone}`}>
                <div className={styles.stageHead}>
                  <span>4. One replacement</span>
                  <Icon name="lock" size={13} />
                </div>
                <strong>{stageFourStatus}</strong>
              </div>
            </div>

            <p className={styles.policyNote}>
              <Icon name="info" size={13} />
              <span>{decision.reasons.join(" ")}</span>
            </p>
          </section>

          <div className={styles.grid}>
            <div className={styles.mainColumn}>
              <section
                className={styles.card}
                aria-labelledby="message-title"
                id="message"
              >
                <div className={styles.cardHead}>
                  <div>
                    <p className={styles.kicker}>01 · Supplier message</p>
                    <h2 id="message-title">What the supplier said</h2>
                  </div>
                  <span className={`${styles.badge} ${styles.badgeWarn}`}>
                    <Icon name="alert" size={11} />
                    UNTRUSTED SUPPLIER CONTENT
                  </span>
                </div>

                <div className={styles.rawMessage}>
                  <div className={styles.rawMeta}>
                    <span>RAW_PAYLOAD_EXTRACT [INBOUND_EMAIL]</span>
                    <span>
                      Received {formatTimestamp(incident.supplierMessage.receivedAt)}
                    </span>
                  </div>
                  <blockquote className={styles.message}>
                    {incident.supplierMessage.raw}
                  </blockquote>
                </div>

                <p className={styles.bodyMuted}>
                  The message is data, not policy. It cannot change the payee,
                  amount, request ID, or approval rule.
                </p>

                <div className={styles.twoCol}>
                  <div className={styles.subPanel}>
                    <h3 className={styles.panelLabel}>
                      <Icon name="file" size={12} />
                      Extracted claims
                    </h3>
                    <ul className={styles.list}>
                      {analysis.supplierClaims.map((claim) => (
                        <li key={claim}>{claim}</li>
                      ))}
                    </ul>
                  </div>
                  <div className={styles.subPanel}>
                    <h3
                      className={`${styles.panelLabel} ${styles.panelLabelDanger}`}
                    >
                      <Icon name="alert" size={12} />
                      Missing or blocked
                    </h3>
                    {analysis.missingInformation.length > 0 ? (
                      <ul className={`${styles.list} ${styles.listDanger}`}>
                        {analysis.missingInformation.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.bodyMuted}>
                        No missing information for this fixture.
                      </p>
                    )}
                  </div>
                </div>

                <div className={styles.analysisBar} aria-live="polite">
                  <div>
                    <span className={styles.microLabel}>Analysis source</span>
                    <span className={styles.sourceValue}>{analysis.source}</span>
                  </div>
                  <button
                    type="button"
                    className={styles.button}
                    onClick={handleAnalyse}
                    disabled={analysing}
                    data-testid="analyse-complaint"
                  >
                    <Icon name="refresh" size={13} />
                    {analysing ? "Analysing…" : "Re-analyse complaint"}
                  </button>
                </div>
                {analysisError ? (
                  <p className={styles.error} role="alert">
                    {analysisError}
                  </p>
                ) : null}
              </section>

              <section
                className={styles.card}
                aria-labelledby="evidence-title"
                id="evidence"
              >
                <div className={styles.cardHead}>
                  <div>
                    <p className={styles.kicker}>02 · Evidence</p>
                    <h2 id="evidence-title">Trusted payment record</h2>
                  </div>
                  <span className={`${styles.badge} ${styles.badgeInfo}`}>
                    {incident.evidence.source.toUpperCase()} TELEMETRY
                  </span>
                </div>

                <dl className={styles.evidenceList}>
                  <div className={styles.evidenceRow}>
                    <dt>Provider status</dt>
                    <dd>
                      <span className={styles.statusPill}>
                        {incident.evidence.providerStatus}
                      </span>
                    </dd>
                  </div>
                  <div className={styles.evidenceRow}>
                    <dt>Available balance</dt>
                    <dd className={styles.evidenceAmount}>
                      {available} {incident.evidence.currency}
                    </dd>
                  </div>
                  <div className={styles.evidenceRow}>
                    <dt>Transfer ID</dt>
                    <dd className={styles.accentText}>
                      {incident.evidence.providerTransferId ?? "—"}
                    </dd>
                  </div>
                  <div className={styles.evidenceRow}>
                    <dt>Request ID</dt>
                    <dd>{incident.evidence.providerRequestId ?? "—"}</dd>
                  </div>
                  <div className={styles.evidenceRow}>
                    <dt>Failure code</dt>
                    <dd>{incident.evidence.failureCode ?? "none"}</dd>
                  </div>
                  <div className={styles.evidenceRow}>
                    <dt>Last evidence read</dt>
                    <dd>{formatTimestamp(incident.evidence.fetchedAt)}</dd>
                  </div>
                </dl>

                <p className={styles.evidenceNote}>
                  <Icon name="database" size={13} />
                  <span>
                    {incident.evidence.notes} A stored fixture is not a fresh
                    provider read.
                  </span>
                </p>

                <div className={styles.actionRow}>
                  <button
                    type="button"
                    className={styles.button}
                    disabled
                    title="Not implemented in the foundation. No live provider read is made."
                  >
                    <Icon name="lock" size={12} />
                    Refresh evidence
                  </button>
                  <span className={styles.bodyMuted}>
                    Live refresh is intentionally disabled.
                  </span>
                </div>
              </section>

              <section
                className={styles.card}
                aria-labelledby="decision-title"
                id="decision"
              >
                <div className={styles.cardHead}>
                  <div>
                    <p className={styles.kicker}>03 · Decision</p>
                    <h2 id="decision-title">What is permitted now</h2>
                  </div>
                  <span className={`${styles.badge} ${styles.badgeDanger}`}>
                    VERDICT: {decision.replacementAllowed ? "REVIEW" : "BLOCKED"}
                  </span>
                </div>

                <div className={styles.decisionBanner}>
                  <div>
                    <span className={styles.microLabel}>Policy conclusion</span>
                    <strong data-testid="decision-state">
                      {stateLabels[decision.state]}
                    </strong>
                  </div>
                  <span className={styles.decisionVersion}>
                    evidence {decision.evidenceVersion}
                  </span>
                </div>

                <div className={styles.twoCol}>
                  <div>
                    <h3 className={styles.panelLabel}>
                      <Icon name="check" size={12} />
                      Allowed
                    </h3>
                    <div className={styles.chips}>
                      {decision.allowedActions.map((action) => (
                        <span
                          key={action}
                          className={`${styles.chip} ${styles.chipAllowed}`}
                        >
                          <Icon name="check" size={11} />
                          {actionLabels[action]}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className={`${styles.panelLabel} ${styles.panelLabelDanger}`}>
                      <Icon name="lock" size={12} />
                      Blocked
                    </h3>
                    <div className={styles.chips}>
                      {decision.blockedActions.map((action) => (
                        <span
                          key={action}
                          className={`${styles.chip} ${styles.chipBlocked}`}
                        >
                          <Icon name="lock" size={11} />
                          {actionLabels[action]}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={styles.reasonsBox}>
                  <h3 className={styles.panelLabel}>Backend reasons</h3>
                  <ul className={`${styles.list} ${styles.listPlain}`}>
                    {decision.reasons.map((reason) => (
                      <li key={reason}>
                        <Icon
                          name={reason.includes("still SENT") ? "info" : "shield"}
                          size={13}
                        />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className={styles.proposalBox}>
                  <div>
                    <span className={styles.microLabel}>
                      Model proposal · fixture analyzer
                    </span>
                    <strong>{actionLabels[analysis.suggestedAction]}</strong>
                  </div>
                  <span className={styles.proposalEvidence}>
                    Evidence: {analysis.evidenceIds.join(", ") || "none"}
                  </span>
                </div>
                <p className={styles.bodyMuted}>{analysis.explanation}</p>

                <div className={styles.actionsGrid}>
                  <button
                    type="button"
                    className={styles.button}
                    disabled={!decision.replacementAllowed}
                    title={
                      decision.replacementAllowed
                        ? "Preparation is implemented in a later milestone."
                        : "Blocked by policy: a replacement cannot be prepared from the current evidence."
                    }
                  >
                    <Icon name="lock" size={12} />
                    Prepare replacement
                  </button>
                  <button
                    type="button"
                    className={styles.button}
                    disabled
                    title="Approval is not exposed by this fixture UI."
                  >
                    <Icon name="lock" size={12} />
                    Approve exact terms
                  </button>
                  <button
                    type="button"
                    className={styles.button}
                    disabled
                    title="Execution is intentionally unavailable from this fixture UI."
                  >
                    <Icon name="lock" size={12} />
                    Execute approved replacement
                  </button>
                </div>
              </section>

              <section
                className={styles.card}
                aria-labelledby="timeline-title"
                id="timeline"
              >
                <div className={styles.cardHead}>
                  <div>
                    <p className={styles.kicker}>04 · Timeline</p>
                    <h2 id="timeline-title">Append-only events</h2>
                  </div>
                  <span className={`${styles.badge} ${styles.badgeMuted}`}>
                    {incident.timeline.length} EVENTS
                  </span>
                </div>

                <ol className={styles.timeline}>
                  {incident.timeline.map((event) => (
                    <li key={event.id} className={styles.timelineItem}>
                      <span
                        className={`${styles.timelineDot} ${
                          event.actor === "SUPPLIER"
                            ? styles.dotAmber
                            : styles.dotCyan
                        }`}
                        aria-hidden="true"
                      />
                      <div className={styles.timelineTop}>
                        <span className={styles.eventType}>{event.type}</span>
                        <span className={styles.eventTime}>
                          {formatTimestamp(event.at)}
                        </span>
                      </div>
                      <p>{event.summary}</p>
                      <div className={styles.eventMeta}>
                        <span className={styles.actor}>{event.actor}</span>
                        <span>
                          correlation{" "}
                          <span className={styles.accentText}>
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
              <section
                className={styles.card}
                aria-labelledby="approval-title"
                id="approval"
              >
                <div className={styles.cardHead}>
                  <div>
                    <p className={styles.kicker}>Approval panel</p>
                    <h2 id="approval-title">Exact terms only</h2>
                  </div>
                  <span className={`${styles.badge} ${styles.badgeDanger}`}>
                    <Icon name="lock" size={11} />
                    {approval ? approval.state : "NO APPROVAL"}
                  </span>
                </div>

                <p className={styles.approvalLead}>
                  This approval authorises one replacement attempt on these
                  terms only.
                </p>

                <dl className={styles.terms}>
                  <div className={styles.termRow}>
                    <dt>Beneficiary</dt>
                    <dd>{incident.obligation.beneficiary.alias}</dd>
                  </div>
                  <div className={styles.termRow}>
                    <dt>Fingerprint</dt>
                    <dd className={styles.accentText}>
                      {incident.obligation.beneficiary.fingerprint}
                    </dd>
                  </div>
                  <div className={styles.termRow}>
                    <dt>Invoice</dt>
                    <dd>{incident.invoiceReference}</dd>
                  </div>
                  <div className={styles.termRow}>
                    <dt>Amount</dt>
                    <dd className={styles.termStrong}>{amount}</dd>
                  </div>
                  <div className={styles.termRow}>
                    <dt>Fee allowance</dt>
                    <dd>{feeAllowance}</dd>
                  </div>
                  <div className={styles.termRow}>
                    <dt>Original request</dt>
                    <dd>{originalRequest}</dd>
                  </div>
                  <div className={styles.termRow}>
                    <dt>Evidence version</dt>
                    <dd>{decision.evidenceVersion}</dd>
                  </div>
                  <div className={styles.termRow}>
                    <dt>Policy version</dt>
                    <dd>{decision.policyVersion}</dd>
                  </div>
                  <div className={styles.termRow}>
                    <dt>Approver</dt>
                    <dd>{approval ? approval.approver : "Not assigned"}</dd>
                  </div>
                  <div className={styles.termRow}>
                    <dt>Expiry</dt>
                    <dd className={styles.termDanger}>
                      {approval ? formatTimestamp(approval.expiresAt) : "Not issued"}
                    </dd>
                  </div>
                </dl>

                <p className={styles.approvalNote}>
                  <Icon name="alert" size={14} />
                  <span>
                    {decision.replacementAllowed
                      ? "A replacement may be prepared, but no approval has been issued. Approval and execution remain unavailable from this fixture UI."
                      : "No approval can be prepared from the current policy state. The server blocks replacement before any approval exists."}
                  </span>
                </p>

                <button
                  type="button"
                  className={`${styles.button} ${styles.fullWidthButton}`}
                  disabled
                  title="Approval is not exposed by this fixture UI."
                >
                  <Icon name="lock" size={13} />
                  Approve exact terms
                </button>
              </section>

              <section className={styles.card} aria-labelledby="driver-title">
                <div className={styles.cardHead}>
                  <div>
                    <p className={styles.kicker}>Separate demo driver</p>
                    <h2 id="driver-title">Operator-only boundary</h2>
                  </div>
                  <span className={`${styles.badge} ${styles.badgeWarn}`}>
                    NOT IMPLEMENTED
                  </span>
                </div>
                <p className={styles.bodyMuted}>
                  Funding, transfer simulation, and failure-injection controls
                  are intentionally absent. The model has no route that can
                  create the facts used to justify a payment.
                </p>
                <button
                  type="button"
                  className={`${styles.button} ${styles.fullWidthButton}`}
                  disabled
                  title="Demo-driver routes are not implemented in the foundation."
                >
                  <Icon name="lock" size={13} />
                  Open demo driver
                </button>
              </section>

              <section
                className={styles.card}
                aria-labelledby="status-title"
                id="integration-status"
              >
                <div className={styles.cardHead}>
                  <div>
                    <p className={styles.kicker}>Integration status</p>
                    <h2 id="status-title">Honest boundaries</h2>
                  </div>
                  <span className={`${styles.badge} ${styles.badgeMuted}`}>
                    {integrationStatus.verifiedCalls} VERIFIED CALLS
                  </span>
                </div>

                <dl className={styles.statusList}>
                  <div className={styles.statusRow}>
                    <dt>Airwallex rail</dt>
                    <dd className={statusTone(integrationStatus.airwallex)}>
                      {integrationStatus.airwallex}
                    </dd>
                  </div>
                  <div className={styles.statusRow}>
                    <dt>Database ledger</dt>
                    <dd className={statusTone(integrationStatus.database)}>
                      {integrationStatus.database}
                    </dd>
                  </div>
                  <div className={styles.statusRow}>
                    <dt>Model engine</dt>
                    <dd className={statusTone(integrationStatus.model)}>
                      {integrationStatus.model}
                    </dd>
                  </div>
                  <div className={styles.statusRow}>
                    <dt>Live calls gate</dt>
                    <dd
                      className={
                        integrationStatus.liveCallsEnabled
                          ? styles.statusWarn
                          : styles.statusBad
                      }
                    >
                      {integrationStatus.liveCallsEnabled
                        ? "ENABLED"
                        : "DISABLED"}
                    </dd>
                  </div>
                </dl>

                <p className={styles.integrationNote}>
                  A configured environment variable does not prove provider
                  access. Every authenticated call remains unconfirmed until
                  tested.
                </p>
              </section>
            </aside>
          </div>
        </main>

        <footer className={styles.footer}>
          <div className={styles.footerText}>
            <span>
              <strong>One Invoice</strong> · synthetic sandbox concept · not
              production banking software.
            </span>
            <span className={styles.footerDivider} aria-hidden="true">
              |
            </span>
            <span>No BeyondFlow or ArmorIQ code. No live provider calls.</span>
          </div>
          <div className={styles.footerMeta}>
            <span>Policy {decision.policyVersion}</span>
            <span>Evidence {decision.evidenceVersion}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
