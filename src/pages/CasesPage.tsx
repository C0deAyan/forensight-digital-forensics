import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Briefcase, Plus, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getUserMessage } from '@/lib/errors';
import { CASE_STATUS_LABELS, formatUtc } from '@/lib/format';
import { navigate } from '@/hooks/useRoute';
import type { CaseRow, CaseStatus } from '@/types/forensight';
import {
  Alert, Button, CaseStatusBadge, EmptyState, Modal, PageHeader, Spinner, inputClass, labelClass,
} from '@/components/ui';

type CaseListItem = CaseRow & { evidenceCount: number };

const STATUS_OPTIONS = Object.entries(CASE_STATUS_LABELS) as [CaseStatus, string][];

export default function CasesPage() {
  const [cases, setCases] = useState<CaseListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | CaseStatus>('all');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const [casesResult, evidenceResult] = await Promise.all([
      supabase.from('cases').select('*').order('created_at', { ascending: false }),
      supabase.from('evidence').select('case_id'),
    ]);
    if (casesResult.error || evidenceResult.error) {
      getUserMessage(casesResult.error ?? evidenceResult.error);
      setError('Cases could not be loaded. Please refresh the page.');
      return;
    }
    const counts = new Map<string, number>();
    evidenceResult.data.forEach((row) => counts.set(row.case_id, (counts.get(row.case_id) ?? 0) + 1));
    setCases((casesResult.data as CaseRow[]).map((item) => ({ ...item, evidenceCount: counts.get(item.id) ?? 0 })));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    if (!cases) return [];
    const term = query.trim().toLowerCase();
    return cases.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!term) return true;
      return item.title.toLowerCase().includes(term) || item.case_number.toLowerCase().includes(term);
    });
  }, [cases, query, statusFilter]);

  return (
    <>
      <PageHeader
        title="Case Management"
        description="Investigation cases group related evidence, notes, and status history under a unique case number."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            New case
          </Button>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_200px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title or case number"
            aria-label="Search cases"
            className={`${inputClass} pl-10`}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as 'all' | CaseStatus)}
          aria-label="Filter by status"
          className={inputClass}
        >
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {!error && !cases && <Spinner label="Loading cases" />}

      {cases && cases.length === 0 && (
        <EmptyState
          icon={<Briefcase className="h-5 w-5" />}
          title="No investigation cases yet"
          description="Create a case first. Evidence is always registered under a case so its chain of custody has context."
          action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Create your first case</Button>}
        />
      )}

      {cases && cases.length > 0 && visible.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-400">No cases match your search or filter.</p>
      )}

      {visible.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(`/cases/${item.id}`)}
              className="group rounded-xl border border-night-700 bg-night-850/80 p-5 text-left shadow-lg shadow-black/20 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-400/40 hover:shadow-cyan-900/20"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <span className="font-mono text-xs tracking-wide text-cyan-300">{item.case_number}</span>
                <CaseStatusBadge status={item.status} label={CASE_STATUS_LABELS[item.status]} />
              </div>
              <h3 className="text-base font-semibold text-slate-100 group-hover:text-cyan-100">{item.title}</h3>
              <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm leading-relaxed text-slate-400">
                {item.description || 'No description provided.'}
              </p>
              <div className="mt-4 flex items-center justify-between border-t border-night-700 pt-3 text-xs text-slate-500">
                <span>{item.evidenceCount} evidence {item.evidenceCount === 1 ? 'item' : 'items'}</span>
                <span>Opened {formatUtc(item.created_at)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {creating && (
        <CreateCaseModal
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            navigate(`/cases/${id}`);
          }}
        />
      )}
    </>
  );
}

function CreateCaseModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed.length < 3 || trimmed.length > 160) {
      setError('Case title must be between 3 and 160 characters.');
      return;
    }
    if (description.length > 4000) {
      setError('Description must be 4000 characters or fewer.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from('cases')
      .insert({ title: trimmed, description: description.trim() })
      .select('id')
      .single();
    if (insertError || !data) {
      setSubmitting(false);
      setError(getUserMessage(insertError, 'The case could not be created. Please try again.'));
      return;
    }
    onCreated(data.id);
  };

  return (
    <Modal title="Create investigation case" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div>
          <label htmlFor="case-title" className={labelClass}>Case title</label>
          <input
            id="case-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={inputClass}
            placeholder="e.g. Laptop intrusion, Finance dept."
            autoFocus
          />
        </div>
        <div>
          <label htmlFor="case-description" className={labelClass}>Description</label>
          <textarea
            id="case-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            className={inputClass}
            placeholder="Scope, reported incident, and authorization reference."
          />
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={submitting}>{submitting ? 'Creating' : 'Create case'}</Button>
        </div>
      </form>
    </Modal>
  );
}
