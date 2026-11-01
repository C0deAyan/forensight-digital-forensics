import { useState, type FormEvent } from 'react';
import { Fingerprint, Lock, Mail, ShieldCheck, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getAuthMessage } from '@/lib/errors';
import { Alert, Button, inputClass, labelClass } from '@/components/ui';

const MIN_PASSWORD_LENGTH = 12;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSignUp = mode === 'signup';

  const validate = (): string | null => {
    if (!EMAIL_PATTERN.test(email.trim())) return 'Enter a valid work email address.';
    if (isSignUp && password.length < MIN_PASSWORD_LENGTH) {
      return `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`;
    }
    if (!password) return 'Enter your password.';
    return null;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    try {
      if (isSignUp) {
        await signUp(email.trim(), password);
        setNotice('Account created. You are now signed in.');
      } else {
        await signIn(email.trim(), password);
      }
    } catch (cause) {
      setError(getAuthMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-night-950 px-5 py-12">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-sky-600/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.04)_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>

      <div className="relative w-full max-w-md animate-[fadeUp_0.5s_ease-out]">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 shadow-[0_0_40px_-8px_rgba(34,211,238,0.5)]">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">ForenSight Enterprise</h1>
          <p className="mt-2 text-sm text-slate-400">Every Evidence Has a Story. Every Hash Tells the Truth.</p>
        </div>

        <div className="rounded-2xl border border-night-600/70 bg-night-850/90 p-8 shadow-2xl shadow-black/40 backdrop-blur">
          <div className="mb-6 grid grid-cols-2 rounded-lg bg-night-900 p-1" role="tablist">
            {(['signin', 'signup'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={mode === tab}
                onClick={() => {
                  setMode(tab);
                  setError(null);
                  setNotice(null);
                }}
                className={`rounded-md py-2 text-sm font-medium transition-all duration-200 ${
                  mode === tab ? 'bg-cyan-400 text-night-950 shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="email" className={labelClass}>Work email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={`${inputClass} pl-10`}
                  placeholder="investigator@agency.gov"
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="text-xs font-medium text-slate-300">Password</label>
                {isSignUp && <span className="text-xs text-slate-500">Minimum {MIN_PASSWORD_LENGTH} characters</span>}
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={`${inputClass} pl-10 pr-10`}
                  placeholder="••••••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 transition hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && <Alert tone="error">{error}</Alert>}
            {notice && <Alert tone="success">{notice}</Alert>}

            <Button type="submit" disabled={submitting} className="w-full py-2.5">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : isSignUp ? <Fingerprint className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
              {submitting ? 'Please wait' : isSignUp ? 'Create investigator account' : 'Sign in securely'}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-slate-500">
          Authorized investigators only. All evidence access is recorded in the chain of custody.
        </p>
      </div>
    </div>
  );
}
