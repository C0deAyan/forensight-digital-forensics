import { useState, type FormEvent, type ReactNode } from 'react';
import { KeyRound, LogOut, ShieldCheck, UserRound, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { getAuthMessage, getUserMessage } from '@/lib/errors';
import { formatUtc } from '@/lib/format';
import { Alert, Button, Card, PageHeader, inputClass, labelClass } from '@/components/ui';

const MIN_PASSWORD_LENGTH = 12;
const APP_VERSION = '1.0.0';

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <>
      <PageHeader title="Settings" description="Manage your investigator profile, account security, and review application information." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Investigator profile" subtitle="Identity recorded on every custody entry you create.">
          <dl className="space-y-4 text-sm">
            <ProfileRow icon={<UserRound className="h-4 w-4" />} label="Email" value={user?.email ?? '—'} />
            <ProfileRow icon={<ShieldCheck className="h-4 w-4" />} label="Investigator ID" value={user?.id ?? '—'} mono />
            <ProfileRow icon={<KeyRound className="h-4 w-4" />} label="Account created" value={user?.created_at ? formatUtc(user.created_at) : '—'} />
            <ProfileRow icon={<ShieldCheck className="h-4 w-4" />} label="Last sign-in" value={user?.last_sign_in_at ? formatUtc(user.last_sign_in_at) : '—'} />
          </dl>
        </Card>

        <Card title="Security" subtitle="Sessions end automatically after 30 minutes without activity.">
          <div className="space-y-6">
            <PasswordForm />
            <div className="border-t border-night-700 pt-6">
              <p className="mb-3 text-sm text-slate-300">Sign out of every device, including this one.</p>
              <Button variant="danger" onClick={signOutEverywhere}>
                <LogOut className="h-4 w-4" />
                Sign out everywhere
              </Button>
            </div>
          </div>
        </Card>

        <Card title="About ForenSight Enterprise" subtitle="Digital forensics and evidence integrity platform" className="lg:col-span-2">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3 text-sm text-slate-300">
              <p><span className="text-slate-500">Version: </span>{APP_VERSION}</p>
              <p><span className="text-slate-500">Hashing: </span>SHA-256 (primary) and SHA-512, streamed through the Web Crypto API</p>
              <p><span className="text-slate-500">Storage: </span>Private, owner-scoped evidence bucket. Original bytes are stored unchanged.</p>
              <p><span className="text-slate-500">Audit trail: </span>Hash-chained, append-only custody records</p>
            </div>
            <div className="flex gap-3 rounded-lg border border-night-700 bg-night-900/60 p-4 text-xs leading-relaxed text-slate-400">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
              <p>
                Integrity checks prove that stored bytes match the bytes registered at acquisition. The hash chain is application-level tamper evidence and is not an independent trusted timestamp or an externally immutable audit system. Use only on evidence you are authorized to examine.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

async function signOutEverywhere() {
  const { error } = await supabase.auth.signOut({ scope: 'global' });
  if (error) getUserMessage(error);
}

function ProfileRow({ icon, label, value, mono = false }: { icon: ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-cyan-300">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</dt>
        <dd className={`mt-0.5 break-all text-slate-200 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
      </div>
    </div>
  );
}

function PasswordForm() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setMessage({ tone: 'error', text: `Use at least ${MIN_PASSWORD_LENGTH} characters.` });
      return;
    }
    if (password !== confirm) {
      setMessage({ tone: 'error', text: 'The two passwords do not match.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setMessage({ tone: 'error', text: getAuthMessage(error) });
      return;
    }
    setPassword('');
    setConfirm('');
    setMessage({ tone: 'success', text: 'Password updated.' });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <p className="text-sm font-medium text-slate-200">Change password</p>
      <div>
        <label htmlFor="new-password" className={labelClass}>New password</label>
        <input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor="confirm-password" className={labelClass}>Confirm new password</label>
        <input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} className={inputClass} />
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div className="flex justify-end">
        <Button type="submit" disabled={saving || !password}>{saving ? 'Updating' : 'Update password'}</Button>
      </div>
    </form>
  );
}
