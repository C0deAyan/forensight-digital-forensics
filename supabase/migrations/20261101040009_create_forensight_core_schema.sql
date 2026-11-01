/*
# Create ForenSight core forensic schema

Plain-English summary: adds the tables needed to manage investigation cases, register digital evidence with its cryptographic hashes, record integrity verifications, keep a tamper-evident chain of custody log, and store investigation notes. Every table is private to the investigator who created it.

## 1. New tables
- `cases`: investigation cases with a unique case number, title, description, and status (open, under_investigation, pending_review, closed).
- `evidence`: registered evidence items linked to a case. Stores original filename, byte size, declared and detected file format, signature check result, storage path, SHA-256 and SHA-512 hashes, source, and description. Rows are immutable from the app: they are written only by the register_evidence function.
- `evidence_findings`: rule-based suspicious indicator findings for an evidence item (title, description, severity, detection reason).
- `integrity_verifications`: each byte-level integrity check, with expected and computed SHA-256 and the MATCH or MISMATCH result.
- `custody_events`: append-only chain of custody log. Each row stores the previous entry hash and its own SHA-256 entry hash, so any silent edit breaks the chain.
- `investigation_notes`: free-text notes attached to a case.

## 2. Functions
- `register_evidence`: atomically records evidence, its findings, and the acquisition custody event.
- `verify_evidence_integrity`: compares a client-computed SHA-256 with the stored acquisition hash, records the result, and logs a custody event.
- `log_custody_event`: logs access, export, or report events. Only a fixed allowlist of actions is accepted.

## 3. Security changes
- Row level security is enabled on every new table.
- All tables are owner-scoped: `user_id` defaults to the signed-in user and policies require `user_id = auth.uid()`.
- Custody events and verifications can only be written by the definer functions, which check ownership first. Direct inserts are not granted.
- Custody events are protected by a trigger that rejects UPDATE and DELETE, so audit rows cannot be altered or removed.
- Default Supabase grants to anon are revoked on new tables. Functions are not callable by anon or PUBLIC.

## 4. Important notes
1. Evidence and custody rows cannot be deleted by the app. Cases cannot be deleted while evidence references them.
2. The chain uses an advisory lock per evidence item so concurrent events stay in order.
3. Hashes are computed in the investigator's browser and verified by the database comparison. This proves byte-level integrity, not original authenticity.
*/

CREATE TABLE IF NOT EXISTS cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number text NOT NULL UNIQUE DEFAULT 'CS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 160),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 4000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_investigation', 'pending_review', 'closed')),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_number text NOT NULL UNIQUE DEFAULT 'EV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  original_filename text NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 255),
  file_size bigint NOT NULL CHECK (file_size >= 0 AND file_size <= 52428800),
  declared_mime text NOT NULL DEFAULT 'application/octet-stream' CHECK (char_length(declared_mime) <= 255),
  detected_format text NOT NULL DEFAULT 'Unknown' CHECK (char_length(detected_format) <= 120),
  signature_status text NOT NULL CHECK (signature_status IN ('match', 'mismatch', 'unknown')),
  storage_path text NOT NULL UNIQUE CHECK (char_length(storage_path) BETWEEN 1 AND 512),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  sha512 text NOT NULL CHECK (sha512 ~ '^[0-9a-f]{128}$'),
  source text NOT NULL DEFAULT '' CHECK (char_length(source) <= 255),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  acquired_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evidence_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL REFERENCES evidence(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  description text NOT NULL CHECK (char_length(description) <= 1000),
  severity text NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high')),
  detection_reason text NOT NULL CHECK (char_length(detection_reason) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integrity_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL REFERENCES evidence(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  expected_sha256 text NOT NULL CHECK (expected_sha256 ~ '^[0-9a-f]{64}$'),
  computed_sha256 text NOT NULL CHECK (computed_sha256 ~ '^[0-9a-f]{64}$'),
  result text NOT NULL CHECK (result IN ('MATCH', 'MISMATCH')),
  verified_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS custody_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL REFERENCES evidence(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  action text NOT NULL CHECK (action IN ('acquired', 'integrity_verification', 'evidence_accessed', 'report_generated', 'evidence_exported')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  sequence_no integer NOT NULL DEFAULT 0,
  previous_hash text NOT NULL DEFAULT '',
  record_payload text NOT NULL DEFAULT '',
  entry_hash text NOT NULL DEFAULT '',
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evidence_id, sequence_no)
);

CREATE TABLE IF NOT EXISTS investigation_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cases_user_status_idx ON cases (user_id, status);
CREATE INDEX IF NOT EXISTS evidence_case_idx ON evidence (case_id);
CREATE INDEX IF NOT EXISTS evidence_user_acquired_idx ON evidence (user_id, acquired_at DESC);
CREATE INDEX IF NOT EXISTS findings_evidence_idx ON evidence_findings (evidence_id);
CREATE INDEX IF NOT EXISTS findings_user_severity_idx ON evidence_findings (user_id, severity);
CREATE INDEX IF NOT EXISTS verifications_evidence_idx ON integrity_verifications (evidence_id, verified_at DESC);
CREATE INDEX IF NOT EXISTS custody_user_recorded_idx ON custody_events (user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS notes_case_idx ON investigation_notes (case_id, created_at DESC);

-- Hash chain: each entry commits to the previous entry hash and to its own payload.
CREATE OR REPLACE FUNCTION custody_events_chain_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_last_seq integer;
  v_prev_hash text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.evidence_id::text, 0));

  SELECT sequence_no, entry_hash
    INTO v_last_seq, v_prev_hash
    FROM custody_events
   WHERE evidence_id = NEW.evidence_id
   ORDER BY sequence_no DESC
   LIMIT 1;

  NEW.sequence_no := COALESCE(v_last_seq, 0) + 1;
  NEW.previous_hash := COALESCE(v_prev_hash, repeat('0', 64));
  NEW.recorded_at := clock_timestamp();
  NEW.record_payload := concat_ws(
    '|',
    NEW.id::text,
    NEW.evidence_id::text,
    NEW.user_id::text,
    NEW.action,
    NEW.details::text,
    NEW.sequence_no::text,
    to_char(NEW.recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  );
  NEW.entry_hash := encode(sha256(convert_to(NEW.previous_hash || '|' || NEW.record_payload, 'UTF8')), 'hex');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS custody_events_chain ON custody_events;
CREATE TRIGGER custody_events_chain
  BEFORE INSERT ON custody_events
  FOR EACH ROW EXECUTE FUNCTION custody_events_chain_trigger();

CREATE OR REPLACE FUNCTION custody_events_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Chain of custody records are append-only';
END;
$$;

DROP TRIGGER IF EXISTS custody_events_no_update_delete ON custody_events;
CREATE TRIGGER custody_events_no_update_delete
  BEFORE UPDATE OR DELETE ON custody_events
  FOR EACH ROW EXECUTE FUNCTION custody_events_block_mutation();

ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrity_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE custody_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE investigation_notes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON cases, evidence, evidence_findings, integrity_verifications, custody_events, investigation_notes FROM anon, authenticated;

GRANT SELECT ON cases TO authenticated;
GRANT INSERT (title, description, status) ON cases TO authenticated;
GRANT UPDATE (title, description, status) ON cases TO authenticated;

GRANT SELECT ON evidence TO authenticated;
GRANT SELECT ON evidence_findings TO authenticated;
GRANT SELECT ON integrity_verifications TO authenticated;
GRANT SELECT ON custody_events TO authenticated;

GRANT SELECT, DELETE ON investigation_notes TO authenticated;
GRANT INSERT (case_id, body) ON investigation_notes TO authenticated;

DROP POLICY IF EXISTS "select_own_cases" ON cases;
CREATE POLICY "select_own_cases" ON cases FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_cases" ON cases;
CREATE POLICY "insert_own_cases" ON cases FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_cases" ON cases;
CREATE POLICY "update_own_cases" ON cases FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "select_own_evidence" ON evidence;
CREATE POLICY "select_own_evidence" ON evidence FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "select_own_findings" ON evidence_findings;
CREATE POLICY "select_own_findings" ON evidence_findings FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "select_own_verifications" ON integrity_verifications;
CREATE POLICY "select_own_verifications" ON integrity_verifications FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "select_own_custody" ON custody_events;
CREATE POLICY "select_own_custody" ON custody_events FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "select_own_notes" ON investigation_notes;
CREATE POLICY "select_own_notes" ON investigation_notes FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_notes" ON investigation_notes;
CREATE POLICY "insert_own_notes" ON investigation_notes FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM cases WHERE cases.id = case_id AND cases.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_notes" ON investigation_notes;
CREATE POLICY "delete_own_notes" ON investigation_notes FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION register_evidence(
  p_case_id uuid,
  p_original_filename text,
  p_file_size bigint,
  p_declared_mime text,
  p_detected_format text,
  p_signature_status text,
  p_storage_path text,
  p_sha256 text,
  p_sha512 text,
  p_source text,
  p_description text,
  p_findings jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_evidence_id uuid;
  v_finding jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cases WHERE id = p_case_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'Case not found';
  END IF;

  IF split_part(p_storage_path, '/', 1) <> v_uid::text THEN
    RAISE EXCEPTION 'Invalid storage path';
  END IF;

  IF jsonb_typeof(COALESCE(p_findings, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_findings, '[]'::jsonb)) > 50 THEN
    RAISE EXCEPTION 'Invalid findings payload';
  END IF;

  INSERT INTO evidence (
    case_id, user_id, original_filename, file_size, declared_mime, detected_format,
    signature_status, storage_path, sha256, sha512, source, description
  ) VALUES (
    p_case_id, v_uid, p_original_filename, p_file_size, p_declared_mime, p_detected_format,
    p_signature_status, p_storage_path, p_sha256, p_sha512, p_source, p_description
  )
  RETURNING id INTO v_evidence_id;

  FOR v_finding IN SELECT value FROM jsonb_array_elements(COALESCE(p_findings, '[]'::jsonb)) LOOP
    INSERT INTO evidence_findings (evidence_id, user_id, title, description, severity, detection_reason)
    VALUES (
      v_evidence_id,
      v_uid,
      v_finding->>'title',
      v_finding->>'description',
      v_finding->>'severity',
      v_finding->>'detection_reason'
    );
  END LOOP;

  INSERT INTO custody_events (evidence_id, user_id, action, details)
  VALUES (
    v_evidence_id,
    v_uid,
    'acquired',
    jsonb_build_object(
      'original_filename', p_original_filename,
      'file_size', p_file_size,
      'declared_mime', p_declared_mime,
      'detected_format', p_detected_format,
      'signature_status', p_signature_status,
      'sha256', p_sha256,
      'sha512', p_sha512
    )
  );

  RETURN v_evidence_id;
END;
$$;

CREATE OR REPLACE FUNCTION verify_evidence_integrity(p_evidence_id uuid, p_computed_sha256 text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_expected text;
  v_result text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_computed_sha256 IS NULL OR p_computed_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid hash';
  END IF;

  SELECT sha256 INTO v_expected
    FROM evidence
   WHERE id = p_evidence_id AND user_id = v_uid;

  IF v_expected IS NULL THEN
    RAISE EXCEPTION 'Evidence not found';
  END IF;

  v_result := CASE WHEN v_expected = p_computed_sha256 THEN 'MATCH' ELSE 'MISMATCH' END;

  INSERT INTO integrity_verifications (evidence_id, user_id, expected_sha256, computed_sha256, result)
  VALUES (p_evidence_id, v_uid, v_expected, p_computed_sha256, v_result);

  INSERT INTO custody_events (evidence_id, user_id, action, details)
  VALUES (
    p_evidence_id,
    v_uid,
    'integrity_verification',
    jsonb_build_object('result', v_result, 'expected_sha256', v_expected, 'computed_sha256', p_computed_sha256)
  );

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION log_custody_event(p_evidence_id uuid, p_action text, p_details jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_action NOT IN ('evidence_accessed', 'report_generated', 'evidence_exported') THEN
    RAISE EXCEPTION 'Unsupported custody action';
  END IF;

  IF jsonb_typeof(COALESCE(p_details, '{}'::jsonb)) <> 'object' OR length(COALESCE(p_details, '{}'::jsonb)::text) > 2000 THEN
    RAISE EXCEPTION 'Invalid details payload';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM evidence WHERE id = p_evidence_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'Evidence not found';
  END IF;

  INSERT INTO custody_events (evidence_id, user_id, action, details)
  VALUES (p_evidence_id, v_uid, p_action, COALESCE(p_details, '{}'::jsonb));
END;
$$;

REVOKE EXECUTE ON FUNCTION register_evidence(uuid, text, bigint, text, text, text, text, text, text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION verify_evidence_integrity(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION log_custody_event(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION register_evidence(uuid, text, bigint, text, text, text, text, text, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION verify_evidence_integrity(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION log_custody_event(uuid, text, jsonb) TO authenticated;
