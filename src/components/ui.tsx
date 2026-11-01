import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { X } from 'lucide-react';
import type { CaseStatus, Severity, SignatureStatus, VerificationResult } from '@/types/forensight';

export const inputClass =
  'w-full rounded-lg border border-night-600 bg-night-900 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 transition duration-200 focus:border-cyan-400/70 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-60';

export const labelClass = 'mb-1.5 block text-xs font-medium text-slate-300';

type ButtonVariant = 'primary' | 'secondary' | 'danger';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-cyan-400 text-night-950 hover:bg-cyan-300 shadow-lg shadow-cyan-500/10',
  secondary: 'border border-night-600 bg-night-800 text-slate-200 hover:border-cyan-400/50 hover:text-cyan-200',
  danger: 'border border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20',
};

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  );
}

type AlertTone = 'error' | 'success' | 'info' | 'warning';

const alertTones: Record<AlertTone, string> = {
  error: 'border-rose-500/40 bg-rose-500/10 text-rose-200',
  success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  info: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-100',
};

export function Alert({ tone = 'info', children }: { tone?: AlertTone; children: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3.5 py-2.5 text-sm ${alertTones[tone]}`}>
      {children}
    </div>
  );
}

export function Card({ title, subtitle, actions, children, className = '' }: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-night-700 bg-night-850/80 shadow-lg shadow-black/20 ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-night-700 px-5 py-4">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-100">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-400">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-sm text-slate-400">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
      {label}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-night-600 px-6 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-night-800 text-cyan-300">{icon}</div>
      <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-400">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-night-600 bg-night-850 shadow-2xl sm:rounded-2xl animate-[fadeUp_0.25s_ease-out]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-night-700 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-100">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-slate-400 transition hover:bg-night-700 hover:text-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

const severityStyles: Record<Severity, string> = {
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
  low: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  medium: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  high: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${severityStyles[severity]}`}>
      {severity}
    </span>
  );
}

const caseStatusStyles: Record<CaseStatus, string> = {
  open: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200',
  under_investigation: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  pending_review: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  closed: 'border-slate-500/40 bg-slate-500/10 text-slate-300',
};

export function CaseStatusBadge({ status, label }: { status: CaseStatus; label: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${caseStatusStyles[status]}`}>
      {label}
    </span>
  );
}

const signatureStyles: Record<SignatureStatus, string> = {
  match: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  mismatch: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
  unknown: 'border-slate-500/40 bg-slate-500/10 text-slate-300',
};

const signatureLabels: Record<SignatureStatus, string> = {
  match: 'Signature matches',
  mismatch: 'Extension mismatch',
  unknown: 'Unverified format',
};

export function SignatureBadge({ status }: { status: SignatureStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${signatureStyles[status]}`}>
      {signatureLabels[status]}
    </span>
  );
}

export function VerificationBadge({ result }: { result: VerificationResult }) {
  const style = result === 'MATCH'
    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
    : 'border-rose-500/40 bg-rose-500/15 text-rose-200';
  return (
    <span className={`inline-flex items-center rounded-md border px-2.5 py-1 font-mono text-xs font-semibold tracking-wider ${style}`}>
      {result}
    </span>
  );
}
