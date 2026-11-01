import { supabase } from '@/lib/supabase';
import type { CaseRow, CustodyRow, EvidenceRow, FindingRow, NoteRow, VerificationRow } from '@/types/forensight';

export type CaseReportEvidence = EvidenceRow & {
  findings: FindingRow[];
  verifications: VerificationRow[];
  custody_chain: Pick<CustodyRow, 'sequence_no' | 'action' | 'recorded_at' | 'previous_hash' | 'entry_hash'>[];
};

export type CaseReport = {
  report_type: 'ForenSight Enterprise case report';
  generated_at: string;
  generated_by: string;
  integrity_statement: string;
  case: Pick<CaseRow, 'case_number' | 'title' | 'description' | 'status' | 'created_at'>;
  evidence: CaseReportEvidence[];
  investigation_notes: Pick<NoteRow, 'body' | 'created_at'>[];
};

export const INTEGRITY_STATEMENT =
  'SHA-256 and SHA-512 values prove that the stored bytes are identical to the bytes registered at acquisition. They do not, on their own, prove original authenticity or who created the content.';

export async function buildCaseReport(caseRow: CaseRow, generatedBy: string): Promise<CaseReport> {
  const { data: evidenceRows, error: evidenceError } = await supabase
    .from('evidence')
    .select('*')
    .eq('case_id', caseRow.id)
    .order('acquired_at', { ascending: true });
  if (evidenceError) throw evidenceError;

  const evidenceIds = (evidenceRows as EvidenceRow[]).map((row) => row.id);

  const [findings, verifications, custody, notes] = await Promise.all([
    evidenceIds.length
      ? supabase.from('evidence_findings').select('*').in('evidence_id', evidenceIds).order('created_at')
      : Promise.resolve({ data: [], error: null }),
    evidenceIds.length
      ? supabase.from('integrity_verifications').select('*').in('evidence_id', evidenceIds).order('verified_at')
      : Promise.resolve({ data: [], error: null }),
    evidenceIds.length
      ? supabase.from('custody_events').select('*').in('evidence_id', evidenceIds).order('sequence_no')
      : Promise.resolve({ data: [], error: null }),
    supabase.from('investigation_notes').select('body, created_at').eq('case_id', caseRow.id).order('created_at'),
  ]);

  const failure = [findings, verifications, custody, notes].find((result) => result.error);
  if (failure?.error) throw failure.error;

  const findingRows = (findings.data ?? []) as FindingRow[];
  const verificationRows = (verifications.data ?? []) as VerificationRow[];
  const custodyRows = (custody.data ?? []) as CustodyRow[];

  const evidence: CaseReportEvidence[] = (evidenceRows as EvidenceRow[]).map((row) => ({
    ...row,
    findings: findingRows.filter((item) => item.evidence_id === row.id),
    verifications: verificationRows.filter((item) => item.evidence_id === row.id),
    custody_chain: custodyRows
      .filter((item) => item.evidence_id === row.id)
      .map(({ sequence_no, action, recorded_at, previous_hash, entry_hash }) => ({
        sequence_no,
        action,
        recorded_at,
        previous_hash,
        entry_hash,
      })),
  }));

  return {
    report_type: 'ForenSight Enterprise case report',
    generated_at: new Date().toISOString(),
    generated_by: generatedBy,
    integrity_statement: INTEGRITY_STATEMENT,
    case: {
      case_number: caseRow.case_number,
      title: caseRow.title,
      description: caseRow.description,
      status: caseRow.status,
      created_at: caseRow.created_at,
    },
    evidence,
    investigation_notes: (notes.data ?? []) as Pick<NoteRow, 'body' | 'created_at'>[],
  };
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
