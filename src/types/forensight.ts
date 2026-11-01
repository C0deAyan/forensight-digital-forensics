export type CaseStatus = 'open' | 'under_investigation' | 'pending_review' | 'closed';
export type SignatureStatus = 'match' | 'mismatch' | 'unknown';
export type Severity = 'info' | 'low' | 'medium' | 'high';
export type VerificationResult = 'MATCH' | 'MISMATCH';
export type CustodyAction =
  | 'acquired'
  | 'integrity_verification'
  | 'evidence_accessed'
  | 'report_generated'
  | 'evidence_exported';

export type CaseRow = {
  id: string;
  case_number: string;
  title: string;
  description: string;
  status: CaseStatus;
  user_id: string;
  created_at: string;
};

export type EvidenceRow = {
  id: string;
  evidence_number: string;
  case_id: string;
  user_id: string;
  original_filename: string;
  file_size: number;
  declared_mime: string;
  detected_format: string;
  signature_status: SignatureStatus;
  storage_path: string;
  sha256: string;
  sha512: string;
  source: string;
  description: string;
  acquired_at: string;
};

export type FindingRow = {
  id: string;
  evidence_id: string;
  title: string;
  description: string;
  severity: Severity;
  detection_reason: string;
  created_at: string;
};

export type VerificationRow = {
  id: string;
  evidence_id: string;
  expected_sha256: string;
  computed_sha256: string;
  result: VerificationResult;
  verified_at: string;
};

export type CustodyRow = {
  id: string;
  evidence_id: string;
  user_id: string;
  action: CustodyAction;
  details: Record<string, unknown>;
  sequence_no: number;
  previous_hash: string;
  record_payload: string;
  entry_hash: string;
  recorded_at: string;
};

export type NoteRow = {
  id: string;
  case_id: string;
  body: string;
  created_at: string;
};
