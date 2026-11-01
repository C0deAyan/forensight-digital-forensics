import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, Download, FileSearch, Plus, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getUserMessage } from '@/lib/errors';
import { CASE_STATUS_LABELS, formatBytes, formatUtc } from '@/lib/format';
import { buildCaseReport, downloadJson } from '@/lib/caseReport';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/hooks/useRoute';
import type { CaseRow, CaseStatus, EvidenceRow } from '@/types/forensight';
import CaseNotesCard from '@/components/CaseNotesCard';
import UploadEvidenceForm from '@/components/UploadEvidenceForm';
import {
  Alert, Button, Card, CaseStatusBadge, EmptyState, Modal, SignatureBadge, Spinner, inputClass, labelClass,
} from '@/components/ui';

const STATUS_OPTIONS = Object.entries(CASE_STATUS_LABELS) as [CaseStatus, string][];

export default function CaseDetailPage({ caseId }: { caseId: string }) {
  const [caseRow, setCaseRow] = useState<CaseRow | null | undefined>(undefined);
  const [evidence, setEvidence] = useState<EvidenceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const [caseResult, evidenceResult] = await Promise.all([
      supabase.from('cases').select('*').eq('id', caseId).maybeSingle(),
      supabase.from('evidence').select('*').eq('case_id', caseId).order('acquired_at', { ascending: false }),
    ]);
    if (caseResult.error || evidenceResult.error) {
      getUserMessage(caseResult.error ?? evidenceResult.error);
      setError('This case could not be loaded.');
      return;
    }
    setCaseRow((caseResult.data as CaseRow | null) ?? null);
    setEvidence(evidenceResult.data as EvidenceRow[]);
  }, [caseId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return <BackLink><Alert tone="error">{error}</Alert></BackLink>;
  }
  if (caseRow === undefined) return <Spinner label="Loading case" />;
  if (caseRow === null) {
    return (
      <BackLink>
        <EmptyState icon={<FileSearch className="h-5 w-5" />} title="Case not found" description="It may have been removed or you may not have access to it." />
      </BackLink>
    );
  }

  return (
    <BackLink>
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-xs tracking-wide text-cyan-300">{caseRow.case_number}</p>
          <h1 className="mt-1.5 break-words text-2xl font-semibold tracking-tight text-slate-50">{caseRow.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <CaseStatusBadge status={caseRow.status} label={CASE_STATUS_LABELS[caseRow.status]} />
            <span>Opened {formatUtc(caseRow.created_at)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <ExportReportButton caseRow={caseRow} evidenceIds={(evidence ?? []).map((item) => item.id)} />
          <Button onClick={() => setUploading(true)}>
            <Plus className="h-4 w-4" />
            Register evidence
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <CaseDetailsForm caseRow={caseRow} onSaved={load} />
          <Card title="Evidence in this case" subtitle="Each item keeps its own hashes and chain of custody.">
            {!evidence && <Spinner label="Loading evidence" />}
            {evidence && evidence.length === 0 && (
              <EmptyState
                icon={<FileSearch className="h-5 w-5" />}
                title="No evidence registered"
                description="Upload an authorized file to acquire it, hash it, and start its custody record."
              />
            )}
            {evidence && evidence.length > 0 && (
              <ul className="divide-y divide-night-700">
                {evidence.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/evidence/${item.id}`)}
                      className="flex w-full flex-col gap-2 py-3.5 text-left transition hover:text-cyan-100 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-100">{item.original_filename}</p>
                        <p className="mt-0.5 font-mono text-xs text-slate-500">{item.evidence_number} · {formatBytes(item.file_size)}</p>
                      </div>
                      <SignatureBadge status={item.signature_status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="lg:col-span-2">
          <CaseNotesCard caseId={caseRow.id} />
        </div>
      </div>

      {uploading && (
        <Modal title="Register evidence" onClose={() => setUploading(false)}>
          <UploadEvidenceForm
            fixedCase={{ id: caseRow.id, label: `${caseRow.case_number} · ${caseRow.title}` }}
            onRegistered={(id) => {
              setUploading(false);
              navigate(`/evidence/${id}`);
            }}
          />
        </Modal>
      )}
    </BackLink>
  );
}

function BackLink({ children }: { children: ReactNode }) {
  return (
    <>
      <button
        type="button"
        onClick={() => navigate('/cases')}
        className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-cyan-200"
      >
        <ArrowLeft className="h-4 w-4" />
        All cases
      </button>
      {children}
    </>
  );
}

function CaseDetailsForm({ caseRow, onSaved }: { caseRow: CaseRow; onSaved: () => void }) {
  const [title, setTitle] = useState(caseRow.title);
  const [description, setDescription] = useState(caseRow.description);
  const [status, setStatus] = useState<CaseStatus>(caseRow.status);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const dirty = title !== caseRow.title || description !== caseRow.description || status !== caseRow.status;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed.length < 3 || trimmed.length > 160) {
      setMessage({ tone: 'error', text: 'Case title must be between 3 and 160 characters.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    const { error } = await supabase
      .from('cases')
      .update({ title: trimmed, description: description.trim(), status })
      .eq('id', caseRow.id);
    setSaving(false);
    if (error) {
      setMessage({ tone: 'error', text: getUserMessage(error, 'Changes could not be saved. Please try again.') });
      return;
    }
    setMessage({ tone: 'success', text: 'Case details saved.' });
    onSaved();
  };

  return (
    <Card title="Case details" subtitle="Status changes are shown on the case list and in reports.">
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div>
          <label htmlFor="edit-title" className={labelClass}>Title</label>
          <input id="edit-title" value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass} />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="edit-status" className={labelClass}>Status</label>
            <select id="edit-status" value={status} onChange={(event) => setStatus(event.target.value as CaseStatus)} className={inputClass}>
              {STATUS_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="edit-description" className={labelClass}>Description</label>
          <textarea id="edit-description" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} className={inputClass} />
        </div>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <div className="flex justify-end">
          <Button type="submit" disabled={!dirty || saving}>
            <Save className="h-4 w-4" />
            {saving ? 'Saving' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ExportReportButton({ caseRow, evidenceIds }: { caseRow: CaseRow; evidenceIds: string[] }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const report = await buildCaseReport(caseRow, user?.email ?? 'unknown');
      downloadJson(`${caseRow.case_number}-report.json`, report);
      await Promise.all(
        evidenceIds.map(async (evidenceId) => {
          const { error: logError } = await supabase.rpc('log_custody_event', {
            p_evidence_id: evidenceId,
            p_action: 'report_generated',
            p_details: { case_number: caseRow.case_number, format: 'json' },
          });
          if (logError) throw logError;
        }),
      );
    } catch (cause) {
      setError(getUserMessage(cause, 'The report could not be generated. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Button variant="secondary" onClick={handleExport} disabled={busy}>
        <Download className="h-4 w-4" />
        {busy ? 'Generating' : 'Export JSON report'}
      </Button>
      {error && <p className="max-w-xs text-xs text-rose-300">{error}</p>}
    </div>
  );
}
