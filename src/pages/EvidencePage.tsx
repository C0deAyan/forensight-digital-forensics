import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileSearch, Plus, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getUserMessage } from '@/lib/errors';
import { formatBytes, formatUtc } from '@/lib/format';
import { navigate } from '@/hooks/useRoute';
import type { EvidenceRow, SignatureStatus } from '@/types/forensight';
import UploadEvidenceForm from '@/components/UploadEvidenceForm';
import { Alert, Button, Card, EmptyState, Modal, PageHeader, SignatureBadge, Spinner, inputClass } from '@/components/ui';

type EvidenceListItem = EvidenceRow & { case_number: string };

const SIGNATURE_FILTERS: { value: 'all' | SignatureStatus; label: string }[] = [
  { value: 'all', label: 'All signatures' },
  { value: 'match', label: 'Signature matches' },
  { value: 'mismatch', label: 'Extension mismatch' },
  { value: 'unknown', label: 'Unverified format' },
];

export default function EvidencePage() {
  const [items, setItems] = useState<EvidenceListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [signatureFilter, setSignatureFilter] = useState<'all' | SignatureStatus>('all');
  const [caseFilter, setCaseFilter] = useState('all');
  const [registering, setRegistering] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: loadError } = await supabase
      .from('evidence')
      .select('*, cases(case_number)')
      .order('acquired_at', { ascending: false });
    if (loadError) {
      getUserMessage(loadError);
      setError('Evidence could not be loaded. Please refresh the page.');
      return;
    }
    setItems(
      (data as (EvidenceRow & { cases: { case_number: string } | null })[]).map((row) => ({
        ...row,
        case_number: row.cases?.case_number ?? '—',
      })),
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const caseOptions = useMemo(() => {
    const map = new Map<string, string>();
    items?.forEach((item) => map.set(item.case_id, item.case_number));
    return [...map.entries()];
  }, [items]);

  const visible = useMemo(() => {
    if (!items) return [];
    const term = query.trim().toLowerCase();
    return items.filter((item) => {
      if (signatureFilter !== 'all' && item.signature_status !== signatureFilter) return false;
      if (caseFilter !== 'all' && item.case_id !== caseFilter) return false;
      if (!term) return true;
      return [item.original_filename, item.evidence_number, item.source, item.sha256].some((value) =>
        value.toLowerCase().includes(term),
      );
    });
  }, [items, query, signatureFilter, caseFilter]);

  return (
    <>
      <PageHeader
        title="Evidence Management"
        description="Every registered item is hashed at acquisition and stored as the original bytes. Open an item to verify its integrity."
        actions={
          <Button onClick={() => setRegistering(true)} disabled={items === null}>
            <Plus className="h-4 w-4" />
            Register evidence
          </Button>
        }
      />

      <div className="mb-5 grid gap-3 md:grid-cols-[1fr_200px_200px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, number, source, or SHA-256"
            aria-label="Search evidence"
            className={`${inputClass} pl-10`}
          />
        </div>
        <select aria-label="Filter by signature" value={signatureFilter} onChange={(event) => setSignatureFilter(event.target.value as 'all' | SignatureStatus)} className={inputClass}>
          {SIGNATURE_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select aria-label="Filter by case" value={caseFilter} onChange={(event) => setCaseFilter(event.target.value)} className={inputClass}>
          <option value="all">All cases</option>
          {caseOptions.map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {!error && !items && <Spinner label="Loading evidence" />}

      {items && items.length === 0 && (
        <EmptyState
          icon={<FileSearch className="h-5 w-5" />}
          title="No evidence registered"
          description="Register an authorized file to acquire it, calculate its hashes, and start its chain of custody."
          action={<Button onClick={() => setRegistering(true)}><Plus className="h-4 w-4" />Register evidence</Button>}
        />
      )}

      {items && items.length > 0 && visible.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-400">No evidence matches your filters.</p>
      )}

      {visible.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-4 border-b border-night-700 bg-night-900/60 px-5 py-3 text-xs font-medium uppercase tracking-wider text-slate-500 md:grid">
            <span>File</span>
            <span>Case</span>
            <span>Format</span>
            <span>Signature</span>
          </div>
          <ul className="divide-y divide-night-700">
            {visible.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/evidence/${item.id}`)}
                  className="grid w-full gap-3 px-5 py-4 text-left transition-colors duration-150 hover:bg-night-800/70 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] md:items-center md:gap-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-100">{item.original_filename}</p>
                    <p className="mt-0.5 font-mono text-xs text-slate-500">{item.evidence_number} · {formatBytes(item.file_size)} · {formatUtc(item.acquired_at)}</p>
                  </div>
                  <span className="truncate font-mono text-xs text-cyan-300">{item.case_number}</span>
                  <span className="truncate text-sm text-slate-300">{item.detected_format}</span>
                  <div><SignatureBadge status={item.signature_status} /></div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {registering && (
        <Modal title="Register evidence" onClose={() => setRegistering(false)}>
          <UploadEvidenceForm
            onRegistered={(id) => {
              setRegistering(false);
              navigate(`/evidence/${id}`);
            }}
          />
        </Modal>
      )}
    </>
  );
}
