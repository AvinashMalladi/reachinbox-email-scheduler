import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Inbox, Loader2, X } from 'lucide-react';

/* ── Button ─────────────────────────────────────────── */
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const buttonStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-600 shadow-sm disabled:bg-brand-300 disabled:opacity-100',
  secondary:
    'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  ghost: 'text-slate-600 hover:bg-slate-100',
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
};

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ' +
        buttonStyles[variant] +
        ' ' +
        className
      }
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/* ── Form controls ───────────────────────────────────── */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={
        'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 ' +
        className
      }
    />
  );
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...rest}
      className={
        'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 ' +
        className
      }
    />
  );
}

/* ── Badge ───────────────────────────────────────────── */
const badgeColors: Record<string, string> = {
  scheduled: 'bg-slate-100 text-slate-700 ring-slate-200',
  sending: 'bg-amber-50 text-amber-700 ring-amber-200',
  sent: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  failed: 'bg-rose-50 text-rose-700 ring-rose-200',
  cancelled: 'bg-slate-50 text-slate-500 ring-slate-200',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ' +
        (badgeColors[status] ?? badgeColors.scheduled)
      }
    >
      {status}
    </span>
  );
}

/* ── Spinner / Loading rows ──────────────────────────── */
export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={'h-5 w-5 animate-spin text-brand-600 ' + className} />;
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="animate-pulse">
          <td className="px-4 py-3">
            <div className="h-3 w-40 rounded bg-slate-100" />
          </td>
          <td className="px-4 py-3">
            <div className="h-3 w-56 rounded bg-slate-100" />
          </td>
          <td className="px-4 py-3">
            <div className="h-3 w-28 rounded bg-slate-100" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 w-16 rounded-full bg-slate-100" />
          </td>
        </tr>
      ))}
    </>
  );
}

/* ── Empty state ─────────────────────────────────────── */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
        <Inbox className="h-6 w-6 text-brand-500" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* ── Card / panel ─────────────────────────────────────── */
export function Card({
  title,
  icon,
  badge,
  className = '',
  children,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={'rounded-2xl bg-white p-5 ring-1 ring-slate-200/80 shadow-card ' + className}>
      {(title || badge) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            {icon}
            {title}
          </h3>
          {badge}
        </div>
      )}
      {children}
    </section>
  );
}

/* ── Modal ───────────────────────────────────────────── */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
  accent = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  accent?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-16 backdrop-blur-sm">
      <div
        className="w-full overflow-hidden rounded-2xl bg-white shadow-modal ring-1 ring-slate-200"
        style={{ maxWidth: wide ? '720px' : '520px' }}
      >
        <div
          className={
            'flex items-center justify-between px-6 py-4 ' +
            (accent
              ? 'bg-gradient-to-r from-blue-700 via-blue-600 to-blue-500 text-white'
              : 'border-b border-slate-100')
          }
        >
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className={
              'rounded-lg p-1.5 transition-colors ' +
              (accent ? 'text-blue-100 hover:bg-white/15 hover:text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600')
            }
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}