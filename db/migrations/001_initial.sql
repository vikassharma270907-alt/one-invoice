CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS obligations (
  id text PRIMARY KEY,
  invoice_reference text NOT NULL,
  company_id text NOT NULL,
  company_name text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL CHECK (currency = 'USD'),
  fee_allowance_minor bigint NOT NULL DEFAULT 0 CHECK (fee_allowance_minor >= 0),
  beneficiary_id text NOT NULL,
  beneficiary_alias text NOT NULL,
  beneficiary_fingerprint text NOT NULL,
  beneficiary_country text NOT NULL CHECK (char_length(beneficiary_country) = 2),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, invoice_reference)
);

CREATE TABLE IF NOT EXISTS incidents (
  id text PRIMARY KEY,
  obligation_id text NOT NULL REFERENCES obligations(id),
  complaint_text text NOT NULL,
  complaint_received_at timestamptz NOT NULL,
  app_state text NOT NULL CHECK (
    app_state IN (
      'ORIGINAL_SENT',
      'ORIGINAL_PAID',
      'FAILURE_CONFIRMED_REPLACEABLE',
      'REPLACEMENT_PREPARED',
      'ESCALATED',
      'RECONCILED'
    )
  ),
  policy_version text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evidence_snapshots (
  id text PRIMARY KEY,
  incident_id text NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('fixture', 'sandbox')),
  refresh_status text NOT NULL CHECK (refresh_status IN ('SUCCESS', 'FAILED')),
  fetched_at timestamptz NOT NULL,
  provider_status text CHECK (
    provider_status IN ('SENT', 'PAID', 'FAILED', 'CANCELLED', 'UNKNOWN')
  ),
  provider_transfer_id text,
  provider_request_id text,
  available_balance_minor bigint CHECK (available_balance_minor >= 0),
  currency text CHECK (currency = 'USD'),
  beneficiary_fingerprint text,
  amount_minor bigint CHECK (amount_minor >= 0),
  failure_code text,
  failure_detail text,
  values_hash text NOT NULL,
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evidence_snapshot_shape CHECK (
    (
      refresh_status = 'SUCCESS'
      AND provider_status IS NOT NULL
      AND available_balance_minor IS NOT NULL
      AND currency IS NOT NULL
      AND beneficiary_fingerprint IS NOT NULL
      AND amount_minor IS NOT NULL
      AND error_detail IS NULL
    )
    OR
    (
      refresh_status = 'FAILED'
      AND error_detail IS NOT NULL
      AND provider_status IS NULL
      AND provider_transfer_id IS NULL
      AND provider_request_id IS NULL
      AND available_balance_minor IS NULL
      AND currency IS NULL
      AND beneficiary_fingerprint IS NULL
      AND amount_minor IS NULL
      AND failure_code IS NULL
      AND failure_detail IS NULL
    )
  )
);

CREATE TABLE IF NOT EXISTS approvals (
  id text PRIMARY KEY,
  incident_id text NOT NULL REFERENCES incidents(id),
  approver text NOT NULL,
  terms_hash text NOT NULL,
  terms jsonb NOT NULL,
  evidence_version text NOT NULL,
  policy_version text NOT NULL,
  expires_at timestamptz NOT NULL,
  state text NOT NULL CHECK (
    state IN ('RESERVED', 'CONSUMED', 'REVOKED', 'EXPIRED')
  ),
  reserved_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approval_state_times CHECK (
    (state = 'RESERVED' AND reserved_at IS NOT NULL AND consumed_at IS NULL)
    OR (state = 'CONSUMED' AND reserved_at IS NOT NULL AND consumed_at IS NOT NULL)
    OR state IN ('REVOKED', 'EXPIRED')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS approvals_one_active_per_incident
  ON approvals(incident_id)
  WHERE state IN ('RESERVED', 'CONSUMED');

CREATE TABLE IF NOT EXISTS transfer_attempts (
  id text PRIMARY KEY,
  obligation_id text NOT NULL REFERENCES obligations(id),
  incident_id text NOT NULL REFERENCES incidents(id),
  kind text NOT NULL CHECK (kind IN ('ORIGINAL', 'REPLACEMENT')),
  request_id text NOT NULL UNIQUE,
  provider_id text,
  dispatch_state text NOT NULL CHECK (
    dispatch_state IN ('PREPARED', 'DISPATCHING', 'ACKNOWLEDGED', 'UNKNOWN')
  ),
  provider_status text CHECK (
    provider_status IN ('SENT', 'PAID', 'FAILED', 'CANCELLED', 'UNKNOWN')
  ),
  failure_code text,
  failure_detail text,
  payload jsonb,
  payload_hash text,
  approval_id text REFERENCES approvals(id),
  claimed_by text,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obligation_id, kind),
  CONSTRAINT replacement_requires_approved_payload CHECK (
    kind <> 'REPLACEMENT'
    OR (
      payload IS NOT NULL
      AND payload_hash IS NOT NULL
      AND approval_id IS NOT NULL
    )
  ),
  CONSTRAINT dispatch_claim_shape CHECK (
    (dispatch_state = 'PREPARED' AND claimed_by IS NULL AND claimed_at IS NULL)
    OR (
      dispatch_state IN ('DISPATCHING', 'ACKNOWLEDGED', 'UNKNOWN')
      AND claimed_by IS NOT NULL
      AND claimed_at IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS transfer_attempts_one_per_approval
  ON transfer_attempts(approval_id)
  WHERE approval_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS proposals (
  id text PRIMARY KEY,
  incident_id text NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  evidence_version text NOT NULL,
  suggested_action text NOT NULL CHECK (
    suggested_action IN ('WAIT', 'ESCALATE', 'PREPARE_REPLACEMENT')
  ),
  reasons jsonb NOT NULL,
  schema_valid boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id bigserial PRIMARY KEY,
  incident_id text NOT NULL REFERENCES incidents(id),
  actor text NOT NULL,
  event_type text NOT NULL,
  correlation_id text NOT NULL,
  safe_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS evidence_snapshots_incident_fetched_idx
  ON evidence_snapshots(incident_id, fetched_at DESC);

CREATE INDEX IF NOT EXISTS transfer_attempts_obligation_idx
  ON transfer_attempts(obligation_id);

CREATE INDEX IF NOT EXISTS audit_events_incident_created_idx
  ON audit_events(incident_id, created_at);

CREATE OR REPLACE FUNCTION prevent_obligation_terms_change()
RETURNS trigger AS $$
BEGIN
  IF NEW.invoice_reference IS DISTINCT FROM OLD.invoice_reference
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.fee_allowance_minor IS DISTINCT FROM OLD.fee_allowance_minor
     OR NEW.beneficiary_id IS DISTINCT FROM OLD.beneficiary_id
     OR NEW.beneficiary_alias IS DISTINCT FROM OLD.beneficiary_alias
     OR NEW.beneficiary_fingerprint IS DISTINCT FROM OLD.beneficiary_fingerprint
     OR NEW.beneficiary_country IS DISTINCT FROM OLD.beneficiary_country
  THEN
    RAISE EXCEPTION 'trusted obligation terms are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS obligations_terms_immutable ON obligations;
CREATE TRIGGER obligations_terms_immutable
  BEFORE UPDATE ON obligations
  FOR EACH ROW
  EXECUTE FUNCTION prevent_obligation_terms_change();

CREATE OR REPLACE FUNCTION prevent_approval_binding_change()
RETURNS trigger AS $$
BEGIN
  IF NEW.incident_id IS DISTINCT FROM OLD.incident_id
     OR NEW.approver IS DISTINCT FROM OLD.approver
     OR NEW.terms_hash IS DISTINCT FROM OLD.terms_hash
     OR NEW.terms IS DISTINCT FROM OLD.terms
     OR NEW.evidence_version IS DISTINCT FROM OLD.evidence_version
     OR NEW.policy_version IS DISTINCT FROM OLD.policy_version
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
  THEN
    RAISE EXCEPTION 'approval binding is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS approvals_binding_immutable ON approvals;
CREATE TRIGGER approvals_binding_immutable
  BEFORE UPDATE ON approvals
  FOR EACH ROW
  EXECUTE FUNCTION prevent_approval_binding_change();

CREATE OR REPLACE FUNCTION prevent_attempt_binding_change()
RETURNS trigger AS $$
BEGIN
  IF NEW.obligation_id IS DISTINCT FROM OLD.obligation_id
     OR NEW.incident_id IS DISTINCT FROM OLD.incident_id
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.request_id IS DISTINCT FROM OLD.request_id
     OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
     OR NEW.approval_id IS DISTINCT FROM OLD.approval_id
  THEN
    RAISE EXCEPTION 'transfer attempt binding is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS transfer_attempts_binding_immutable ON transfer_attempts;
CREATE TRIGGER transfer_attempts_binding_immutable
  BEFORE UPDATE ON transfer_attempts
  FOR EACH ROW
  EXECUTE FUNCTION prevent_attempt_binding_change();

CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events are append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_events_append_only ON audit_events;
CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_mutation();
