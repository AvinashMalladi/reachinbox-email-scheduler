import { ExternalLink, Mail, X } from 'lucide-react';
import type { EmailItem } from '../types/api';
import { Button, StatusBadge } from './ui';

type Props = {
  email: EmailItem | null;
  onClose: () => void;
};

function formatFull(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function EmailPreviewModal({ email, onClose }: Props) {
  if (!email) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl ring-1 ring-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-800">
            <Mail className="h-5 w-5 text-brand-600" />
            Email preview
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-slate-800">{email.subject || '(no subject)'}</p>
              <p className="mt-0.5 truncate text-sm text-slate-500">
                From <span className="font-medium text-slate-700">{email.senderEmail ?? 'ReachInbox scheduler'}</span>
              </p>
              <p className="truncate text-sm text-slate-500">
                To <span className="font-medium text-slate-700">{email.recipient}</span>
              </p>
            </div>
            <StatusBadge status={email.status} />
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
            <div>
              <dt className="uppercase tracking-wide">Scheduled</dt>
              <dd className="mt-0.5 font-medium text-slate-700">{formatFull(email.scheduledAt)}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-wide">Delivered</dt>
              <dd className="mt-0.5 font-medium text-slate-700">{formatFull(email.sentAt)}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-wide">Batch</dt>
              <dd className="mt-0.5 font-medium text-slate-700">{email.batchId ? email.batchId.slice(0, 8) : '—'}</dd>
            </div>
            {email.lastError && (
              <div>
                <dt className="uppercase tracking-wide text-rose-500">Error</dt>
                <dd className="mt-0.5 break-words font-medium text-rose-600">{email.lastError}</dd>
              </div>
            )}
          </dl>

          <div className="mt-4 whitespace-pre-wrap break-words rounded-lg border border-slate-200 px-4 py-3 text-sm leading-relaxed text-slate-700">
            {email.body}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          {email.previewUrl && (
            <a
              href={email.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 ring-1 ring-brand-200 hover:bg-brand-100"
            >
              <ExternalLink className="mr-1 inline h-3.5 w-3.5" />
              Open Ethereal inbox
            </a>
          )}
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}