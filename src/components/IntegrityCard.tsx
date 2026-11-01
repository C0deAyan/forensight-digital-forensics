import { useState } from 'react';
import { BadgeCheck, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { sha256Hex } from '@/lib/hashing';
import { getUserMessage } from '@/lib/errors';
import { formatUtc } from '@/lib/format';
import type { EvidenceRow, VerificationResult, VerificationRow } from '@/types/forensight';
import { Alert, Button, Card, VerificationBadge } from '@/components/ui';

type Props = {
  evidence: EvidenceRow;
  verifications: VerificationRow[];
  onVerified: () => void;
};

export default function IntegrityCard({ evidence, verifications, onVerified }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<{ result: VerificationResult; computed: string } | null>(null);

  const handleVerify = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data: blob, error: downloadError } = await supabase.storage.from('evidence').download(evidence.storage_path);
      if (downloadError || !blob) throw downloadError ?? new Error('Stored copy missing');

      const computed = await sha256Hex(await blob.arrayBuffer());
      const { data: result, error: rpcError } = await supabase.rpc('verify_evidence_integrity', {
        p_evidence_id: evidence.id,
        p_computed_sha256: computed,
      });
      if (rpcError || (result !== 'MATCH' && result !== 'MISMATCH')) {
        throw rpcError ?? new Error('Unexpected verification response');
      }

      setLatest({ result, computed });
      onVerified();
    } catch (cause) {
      setError(getUserMessage(cause, 'Integrity verification could not be completed. The stored copy may be unavailable.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Integrity verification"
      subtitle="Re-hashes the stored copy and compares it with the SHA-256 recorded at acquisition."
      actions={
        <Button onClick={handleVerify} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {busy ? 'Verifying' : 'Verify integrity'}
        </Button>
      }
    >
      {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}

      {latest && (
        <div className="mb-5 animate-[fadeUp_0.3s_ease-out] rounded-lg border border-night-700 bg-night-900/70 p-4">
          <div className="mb-3 flex items-center gap-3">
            <VerificationBadge result={latest.result} />
            <span className="text-sm text-slate-300">
              {latest.result === 'MATCH'
                ? 'The stored bytes are identical to the acquired bytes.'
                : 'The stored bytes differ from the acquired bytes. Treat this evidence as compromised until explained.'}
            </span>
          </div>
          <p className="break-all font-mono text-[11px] text-slate-500">Computed SHA-256: {latest.computed}</p>
        </div>
      )}

      <p className="mb-5 flex gap-2 text-xs leading-relaxed text-slate-500">
        <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
        A MATCH proves byte-level integrity only. It does not prove the original item was authentic or unaltered before acquisition.
      </p>

      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">Verification history</h3>
      {verifications.length === 0 ? (
        <p className="text-sm text-slate-400">No verifications have been run for this item.</p>
      ) : (
        <ul className="divide-y divide-night-700 rounded-lg border border-night-700">
          {verifications.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="text-xs text-slate-400">{formatUtc(item.verified_at)}</span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[11px] text-slate-500">{item.computed_sha256.slice(0, 16)}…</span>
                <VerificationBadge result={item.result} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
