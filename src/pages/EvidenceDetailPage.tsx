import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Copy, Check, ScrollText, ShieldAlert, Flag } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getUserMessage } from '@/lib/errors';
import { formatBytes, formatUtc } from '@/lib/format';
import { getExtension } from '@/lib/fileSignatures';
import { navigate } from '@/hooks/useRoute';
import type { EvidenceRow, FindingRow, VerificationRow } from '@/types/forensight';
import IntegrityCard from '@/components/IntegrityCard';
import { Alert, Card, EmptyState, SeverityBadge, SignatureBadge, Spinner } from '@/components/ui';

type EvidenceDetail = EvidenceRow & { cases: { case_number: string; title: string } | null };

export default function EvidenceDetailPage({ evidenceId }: { evidenceId: string }) {
  const [evidence, setEvidence] = useState<EvidenceDetail | null | undefined>(undefined);
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [verifications, setVerifications] = useState<VerificationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const loggedAccess = useRef<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [evidenceResult, findingResult, verificationResult] = await Promise.all([
      supabase.from('evidence').select('*, cases(case_number, title)').eq('id', evidenceId).maybeSingle(),
      supabase.from('evidence_findings').select('*').eq('evidence_id', evidenceId).order('created_at'),
      supabase.from('integrity_verifications').select('*').eq('evidence_id', evidenceId).order('verified_at', { ascending: false }),
    ]);
    if (evidenceResult.error || findingResult.error || verificationResult.error) {
      getUserMessage(evidenceResult.error ?? findingResult.error ?? verificationResult.error);
      setError('This evidence record could not be loaded.');
      return;
    }
    setEvidence((evidenceResult.data as EvidenceDetail | null) ?? null);
    setFindings(findingResult.data as FindingRow[]);
    setVerifications(verificationResult.data as VerificationRow[]);
  }, [evidenceId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!evidence || loggedAccess.current === evidence.id) return;
    loggedAccess.current = evidence.id;
    supabase
      .rpc('log_custody_event', {
        p_evidence_id: evidence.id,
        p_action: 'evidence_accessed',
        p_details: { view: 'evidence_detail' },
      })
      .then(({ error: logError }) => {
        if (logError) getUserMessage(logError);
      });
  }, [evidence]);

  const declaredExtension = getExtension(evidence?.original_filename ?? '');

  const backButton = (
    <button
      type="button"
      onClick={() => navigate('/evidence')}
      className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-cyan-200"
    >
      <ArrowLeft className="h-4 w-4" />
      All evidence
    </button>
  );

  if (error) return <>{backButton}<Alert tone="error">{error}</Alert></>;
  if (evidence === undefined) return <Spinner label="Loading evidence" />;
  if (evidence === null) {
    return (
      <>
        {backButton}
        <EmptyState icon={<ShieldAlert className="h-5 w-5" />} title="Evidence not found" description="It may have been removed or you may not have access to it." />
      </>
    );
  }

  return (
    <>
      {backButton}
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-xs tracking-wide text-cyan-300">{evidence.evidence_number}</p>
          <h1 className="mt-1.5 break-all text-2xl font-semibold tracking-tight text-slate-50">{evidence.original_filename}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <SignatureBadge status={evidence.signature_status} />
            <span>{evidence.detected_format}</span>
            <span>Acquired {formatUtc(evidence.acquired_at)}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/custody/${evidence.id}`)}
          className="inline-flex items-center gap-2 self-start rounded-lg border border-night-600 bg-night-800 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-400/50 hover:text-cyan-200"
        >
          <ScrollText className="h-4 w-4" />
          Chain of custody
        </button>
      </header>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <IntegrityCard evidence={evidence} verifications={verifications} onVerified={load} />

          <Card title="Cryptographic hashes" subtitle="Calculated in the investigator's browser at acquisition. Algorithm and time are recorded.">
            <div className="space-y-5">
              <HashRow label="SHA-256 (primary)" algorithm="SHA-256" value={evidence.sha256} />
              <HashRow label="SHA-512" algorithm="SHA-512" value={evidence.sha512} />
              <p className="text-xs text-slate-500">Calculated {formatUtc(evidence.acquired_at)} over {formatBytes(evidence.file_size)} of original bytes.</p>
            </div>
          </Card>

          <Card title="Findings" subtitle="Rule-based indicators for review. A finding is not a malware verdict.">
            {findings.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-slate-400"><Flag className="h-4 w-4 text-emerald-400" />No indicators were raised by the rule set.</p>
            ) : (
              <ul className="space-y-4">
                {findings.map((finding) => (
                  <li key={finding.id} className="rounded-lg border border-night-700 bg-night-900/60 p-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-100">{finding.title}</h3>
                      <SeverityBadge severity={finding.severity} />
                    </div>
                    <p className="text-sm leading-relaxed text-slate-300">{finding.description}</p>
                    <p className="mt-3 border-l-2 border-cyan-400/40 pl-3 text-xs leading-relaxed text-slate-400">
                      <span className="font-medium text-slate-300">Detection reason: </span>{finding.detection_reason}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">Analyzed {formatUtc(finding.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card title="File details" subtitle="Metadata stored at acquisition. The original file was not modified.">
            <dl className="space-y-4 text-sm">
              <Detail label="Case" value={evidence.cases ? `${evidence.cases.case_number} · ${evidence.cases.title}` : '—'} />
              <Detail label="Size" value={`${formatBytes(evidence.file_size)} (${evidence.file_size.toLocaleString()} bytes)`} />
              <Detail label="Declared type" value={evidence.declared_mime} />
              <Detail label="Declared extension" value={declaredExtension ? `.${declaredExtension}` : 'None'} />
              <Detail label="Detected format" value={evidence.detected_format} />
              <Detail label="Source" value={evidence.source || '—'} />
              <Detail label="Description" value={evidence.description || '—'} />
            </dl>
            <p className="mt-5 rounded-lg bg-night-900/70 p-3 text-xs leading-relaxed text-slate-500">
              Creation and modification timestamps, image dimensions, and EXIF data are not recorded by this release. Platform-dependent fields are not shown rather than estimated.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-slate-200">{value}</dd>
    </div>
  );
}

function HashRow({ label, algorithm, value }: { label: string; algorithm: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (cause) {
      console.error(cause);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-slate-300">{label}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${algorithm} hash`}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-400 transition hover:bg-night-800 hover:text-cyan-200"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <code className="block break-all rounded-lg border border-night-700 bg-night-950 px-3.5 py-3 font-mono text-xs leading-relaxed text-cyan-100">{value}</code>
    </div>
  );
}
