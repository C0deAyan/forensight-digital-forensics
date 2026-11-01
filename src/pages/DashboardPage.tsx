import { useEffect, useState, type ReactNode } from 'react';
import { Briefcase, FileSearch, Fingerprint, ShieldAlert, ShieldCheck, MessageSquare, FolderPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getUserMessage } from '@/lib/errors';
import { ACTION_LABELS, formatDay, formatUtc, relativeTime } from '@/lib/format';
import { navigate } from '@/hooks/useRoute';
import { useAuth } from '@/contexts/AuthContext';
import type { CustodyAction, Severity, VerificationResult } from '@/types/forensight';
import { BarList, ColumnChart, type ChartDatum } from '@/components/charts';
import { Alert, Card, PageHeader, Spinner } from '@/components/ui';

const TIMELINE_DAYS = 14;
const FILE_TYPE_LIMIT = 6;
const SEVERITY_ORDER: { severity: Severity; tone: ChartDatum['tone'] }[] = [
  { severity: 'high', tone: 'rose' },
  { severity: 'medium', tone: 'amber' },
  { severity: 'low', tone: 'emerald' },
  { severity: 'info', tone: 'sky' },
];

type ActivityItem = { id: string; text: string; detail: string; at: string; kind: 'case' | 'note' };
type AuditItem = { id: string; action: CustodyAction; recorded_at: string; evidence_id: string; evidence_number: string };

type Dashboard = {
  evidenceCount: number;
  caseCount: number;
  matches: number;
  mismatches: number;
  timeline: ChartDatum[];
  fileTypes: ChartDatum[];
  severities: ChartDatum[];
  activity: ActivityItem[];
  audit: AuditItem[];
};

type Row = Record<string, unknown>;

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function buildTimeline(acquiredAt: string[]): ChartDatum[] {
  const counts = new Map<string, number>();
  acquiredAt.forEach((iso) => counts.set(dayKey(iso), (counts.get(dayKey(iso)) ?? 0) + 1));
  const days: ChartDatum[] = [];
  const today = new Date();
  for (let offset = TIMELINE_DAYS - 1; offset >= 0; offset -= 1) {
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset));
    const key = day.toISOString().slice(0, 10);
    days.push({ label: formatDay(key), value: counts.get(key) ?? 0 });
  }
  return days;
}

function buildFileTypes(formats: string[]): ChartDatum[] {
  const counts = new Map<string, number>();
  formats.forEach((format) => counts.set(format, (counts.get(format) ?? 0) + 1));
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, FILE_TYPE_LIMIT).map(([label, value]) => ({ label, value }));
  const rest = sorted.slice(FILE_TYPE_LIMIT).reduce((sum, [, value]) => sum + value, 0);
  return rest > 0 ? [...top, { label: 'Other', value: rest }] : top;
}

async function loadDashboard(): Promise<Dashboard> {
  const [evidence, cases, verifications, findings, recentCases, recentNotes, audit] = await Promise.all([
    supabase.from('evidence').select('acquired_at, detected_format'),
    supabase.from('cases').select('id', { count: 'exact', head: true }),
    supabase.from('integrity_verifications').select('result'),
    supabase.from('evidence_findings').select('severity'),
    supabase.from('cases').select('id, case_number, title, created_at').order('created_at', { ascending: false }).limit(5),
    supabase.from('investigation_notes').select('id, body, created_at, cases(case_number)').order('created_at', { ascending: false }).limit(5),
    supabase.from('custody_events').select('id, action, recorded_at, evidence_id, evidence(evidence_number)').order('recorded_at', { ascending: false }).limit(8),
  ]);

  const failure = [evidence, cases, verifications, findings, recentCases, recentNotes, audit].find((result) => result.error);
  if (failure?.error) throw failure.error;

  const evidenceRows = (evidence.data ?? []) as Row[];
  const verificationRows = (verifications.data ?? []) as { result: VerificationResult }[];
  const findingRows = (findings.data ?? []) as { severity: Severity }[];

  const activity: ActivityItem[] = [
    ...((recentCases.data ?? []) as Row[]).map((row) => ({
      id: `case-${row.id as string}`,
      text: `Case opened: ${row.title as string}`,
      detail: row.case_number as string,
      at: row.created_at as string,
      kind: 'case' as const,
    })),
    ...((recentNotes.data ?? []) as Row[]).map((row) => ({
      id: `note-${row.id as string}`,
      text: `Note added to ${((row.cases as { case_number: string } | null)?.case_number) ?? 'case'}`,
      detail: (row.body as string).slice(0, 90),
      at: row.created_at as string,
      kind: 'note' as const,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  return {
    evidenceCount: evidenceRows.length,
    caseCount: cases.count ?? 0,
    matches: verificationRows.filter((row) => row.result === 'MATCH').length,
    mismatches: verificationRows.filter((row) => row.result === 'MISMATCH').length,
    timeline: buildTimeline(evidenceRows.map((row) => row.acquired_at as string)),
    fileTypes: buildFileTypes(evidenceRows.map((row) => row.detected_format as string)),
    severities: SEVERITY_ORDER.map(({ severity, tone }) => ({
      label: severity.charAt(0).toUpperCase() + severity.slice(1),
      value: findingRows.filter((row) => row.severity === severity).length,
      tone,
    })),
    activity,
    audit: ((audit.data ?? []) as Row[]).map((row) => ({
      id: row.id as string,
      action: row.action as CustodyAction,
      recorded_at: row.recorded_at as string,
      evidence_id: row.evidence_id as string,
      evidence_number: ((row.evidence as { evidence_number: string } | null)?.evidence_number) ?? '—',
    })),
  };
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadDashboard()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        getUserMessage(cause);
        setError('Dashboard statistics could not be loaded. Please refresh the page.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const greeting = user?.email?.split('@')[0] ?? 'investigator';

  return (
    <>
      <PageHeader
        title={`Welcome back, ${greeting}`}
        description="A live view of your evidence registry, verification results, and recent investigation activity."
        actions={
          <div className="flex gap-3">
            <button type="button" onClick={() => navigate('/cases')} className="inline-flex items-center gap-2 rounded-lg border border-night-600 bg-night-800 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-400/50 hover:text-cyan-200">
              <FolderPlus className="h-4 w-4" />
              Cases
            </button>
          </div>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}
      {!error && !data && <Spinner label="Loading dashboard" />}

      {data && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={<FileSearch className="h-5 w-5" />} label="Evidence registered" value={data.evidenceCount} tone="cyan" />
            <StatCard icon={<Briefcase className="h-5 w-5" />} label="Investigations" value={data.caseCount} tone="sky" />
            <StatCard icon={<ShieldCheck className="h-5 w-5" />} label="Integrity MATCH" value={data.matches} tone="emerald" />
            <StatCard icon={<ShieldAlert className="h-5 w-5" />} label="Integrity MISMATCH" value={data.mismatches} tone="rose" />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Acquisition timeline" subtitle={`Evidence acquired per day, last ${TIMELINE_DAYS} days (UTC)`} className="lg:col-span-2">
              <ColumnChart data={data.timeline} emptyLabel="No evidence acquired in this period." />
            </Card>
            <Card title="File-type distribution" subtitle="Based on verified file signatures">
              <BarList data={data.fileTypes} emptyLabel="No evidence registered yet." />
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Findings by severity" subtitle="Rule-based indicators for review">
              <BarList data={data.severities} emptyLabel="No findings raised." />
            </Card>
            <Card title="Recent investigation activity" className="lg:col-span-1">
              {data.activity.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-500">No activity yet. Open a case to begin.</p>
              ) : (
                <ul className="space-y-4">
                  {data.activity.map((item) => (
                    <li key={item.id} className="flex gap-3">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-night-800 text-cyan-300">
                        {item.kind === 'case' ? <Briefcase className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-200">{item.text}</p>
                        <p className="truncate text-xs text-slate-500">{item.detail}</p>
                        <p className="text-[11px] text-slate-600">{relativeTime(item.at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Recent audit events" subtitle="Latest chain of custody entries">
              {data.audit.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-500">No audit events recorded.</p>
              ) : (
                <ul className="divide-y divide-night-700">
                  {data.audit.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/custody/${item.evidence_id}`)}
                        className="w-full py-3 text-left transition hover:text-cyan-100 first:pt-0 last:pb-0"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm text-slate-200">{ACTION_LABELS[item.action] ?? item.action}</span>
                          <span className="font-mono text-[11px] text-cyan-300">{item.evidence_number}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500" title={formatUtc(item.recorded_at)}>{formatUtc(item.recorded_at)}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

const STAT_TONES = {
  cyan: 'text-cyan-300 bg-cyan-400/10 ring-cyan-400/25',
  sky: 'text-sky-300 bg-sky-400/10 ring-sky-400/25',
  emerald: 'text-emerald-300 bg-emerald-400/10 ring-emerald-400/25',
  rose: 'text-rose-300 bg-rose-400/10 ring-rose-400/25',
} as const;

function StatCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: keyof typeof STAT_TONES }) {
  return (
    <div className="group rounded-xl border border-night-700 bg-night-850/80 p-5 shadow-lg shadow-black/20 transition-all duration-200 hover:-translate-y-0.5 hover:border-night-600">
      <div className="flex items-center justify-between">
        <span className={`flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${STAT_TONES[tone]}`}>{icon}</span>
        <Fingerprint className="h-4 w-4 text-night-600 transition-colors group-hover:text-slate-500" aria-hidden="true" />
      </div>
      <p className="mt-5 text-3xl font-semibold tabular-nums text-slate-50">{value.toLocaleString()}</p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
    </div>
  );
}
