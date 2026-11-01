import { useEffect, useState } from 'react';
import { CheckCircle2, ShieldAlert, ScrollText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getUserMessage } from '@/lib/errors';
import { verifyCustodyChain, type ChainStatus } from '@/lib/custodyVerification';
import { ACTION_LABELS, formatUtc } from '@/lib/format';
import { navigate } from '@/hooks/useRoute';
import { useAuth } from '@/contexts/AuthContext';
import type { CustodyRow, EvidenceRow } from '@/types/forensight';
import { Alert, Card, EmptyState, PageHeader, Spinner, inputClass } from '@/components/ui';

type EvidenceOption = Pick<EvidenceRow, 'id' | 'evidence_number' | 'original_filename'>;

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; events: CustodyRow[]; chain: ChainStatus };

export default function CustodyPage({ evidenceId }: { evidenceId?: string }) {
  const { user } = useAuth();
  const [options, setOptions] = useState<EvidenceOption[] | null>(null);
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    supabase
      .from('evidence')
      .select('id, evidence_number, original_filename')
      .order('acquired_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          getUserMessage(error);
          setOptions([]);
          return;
        }
        setOptions(data as EvidenceOption[]);
      });
  }, []);

  const selectedId = evidenceId ?? options?.[0]?.id;

  useEffect(() => {
    if (!selectedId) {
      setState({ status: 'loading' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    supabase
      .from('custody_events')
      .select('*')
      .eq('evidence_id', selectedId)
      .order('sequence_no', { ascending: true })
      .then(async ({ data, error }) => {
        if (cancelled) return;
        if (error) {
          getUserMessage(error);
          setState({ status: 'error', message: 'The chain of custody could not be loaded.' });
          return;
        }
        const events = data as CustodyRow[];
        const chain = await verifyCustodyChain(events);
        if (!cancelled) setState({ status: 'ready', events, chain });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  if (options && options.length === 0) {
    return (
      <>
        <PageHeader title="Chain of Custody" description="Chronological custody history for each evidence item, with tamper-evidence checks." />
        <EmptyState icon={<ScrollText className="h-5 w-5" />} title="No custody records yet" description="Custody records are created when evidence is acquired." />
      </>
    );
  }

  const selectedOption = options?.find((item) => item.id === selectedId);

  return (
    <>
      <PageHeader
        title="Chain of Custody"
        description="Each entry is cryptographically linked to the one before it. Any edit or removal breaks the chain and is detected here."
      />

      <div className="mb-6">
        <label htmlFor="custody-evidence" className="mb-1.5 block text-xs font-medium text-slate-300">Evidence item</label>
        <select
          id="custody-evidence"
          value={selectedId ?? ''}
          disabled={!options}
          onChange={(event) => navigate(`/custody/${event.target.value}`)}
          className={`${inputClass} sm:max-w-xl`}
        >
          {options?.map((item) => (
            <option key={item.id} value={item.id}>{item.evidence_number} · {item.original_filename}</option>
          ))}
        </select>
      </div>

      {state.status === 'loading' && <Spinner label="Verifying custody chain" />}
      {state.status === 'error' && <Alert tone="error">{state.message}</Alert>}

      {state.status === 'ready' && (
        <div className="space-y-6">
          <ChainBanner chain={state.chain} count={state.events.length} />

          <Card title={`Custody timeline${selectedOption ? ` · ${selectedOption.evidence_number}` : ''}`} subtitle="Oldest entries first. Times are recorded by the database in UTC.">
            <ol className="relative space-y-6 border-l border-night-700 pl-6">
              {state.events.map((event) => (
                <li key={event.id} className="relative">
                  <span className="absolute -left-[31px] top-1 flex h-3 w-3 items-center justify-center">
                    <span className="h-3 w-3 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.7)]" />
                  </span>
                  <div className="rounded-lg border border-night-700 bg-night-900/60 p-4 transition hover:border-night-600">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-100">
                        <span className="mr-2 font-mono text-xs text-cyan-300">#{event.sequence_no}</span>
                        {ACTION_LABELS[event.action] ?? event.action}
                      </h3>
                      <span className="text-xs text-slate-500">{formatUtc(event.recorded_at)}</span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Recorded by {user && event.user_id === user.id ? 'you' : 'another investigator'}
                    </p>
                    <DetailList details={event.details} />
                    <div className="mt-3 grid gap-2 font-mono text-[11px] text-slate-500 sm:grid-cols-2">
                      <span className="truncate" title={event.previous_hash}>prev {event.previous_hash.slice(0, 20)}…</span>
                      <span className="truncate text-slate-400" title={event.entry_hash}>hash {event.entry_hash.slice(0, 20)}…</span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      )}
    </>
  );
}

function ChainBanner({ chain, count }: { chain: ChainStatus; count: number }) {
  if (chain.valid) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
        <div>
          <p className="text-sm font-semibold text-emerald-100">Chain intact: {count} {count === 1 ? 'entry' : 'entries'} verified</p>
          <p className="mt-1 text-xs leading-relaxed text-emerald-200/70">
            Every entry matches its recorded hash and links to the entry before it. This is application-level tamper evidence, not an independent trusted timestamp.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-5">
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
      <div>
        <p className="text-sm font-semibold text-rose-100">Chain broken at entry #{chain.brokenAtSequence}</p>
        <p className="mt-1 text-xs leading-relaxed text-rose-200/80">{chain.reason} Entries after this point cannot be trusted until the discrepancy is investigated.</p>
      </div>
    </div>
  );
}

function DetailList({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details);
  if (entries.length === 0) return null;
  return (
    <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key} className="min-w-0">
          <dt className="inline text-slate-500">{key.replace(/_/g, ' ')}: </dt>
          <dd className="inline break-all text-slate-300">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
