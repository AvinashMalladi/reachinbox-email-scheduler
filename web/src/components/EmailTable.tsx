import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Eye, RotateCcw, XCircle } from 'lucide-react';
import type { EmailItem } from '../types/api';
import { EmptyState, SkeletonRows, StatusBadge } from './ui';

export type TableMode = 'scheduled' | 'sent';

type Props = {
  mode: TableMode;
  items: EmailItem[];
  loading: boolean;
  onRetry?: (id: string) => void;
  onCancel?: (id: string) => void;
  emptyTitle?: string;
  emptyDescription?: string;
};

function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function EmailTable({ mode, items, loading, onRetry, onCancel, emptyTitle, emptyDescription }: Props) {
  const isSent = mode === 'sent';

  const renderRow = useCallback(
    (email: EmailItem) => (
      <tr key={email.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50/70">
        <td className="max-w-[220px] truncate px-4 py-3 text-sm font-medium text-slate-700" title={email.recipient}>
          {email.recipient}
        </td>
        <td className="max-w-[320px] truncate px-4 py-3 text-sm text-slate-600" title={email.subject}>
          {email.subject}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
          {formatTime(isSent ? email.sentAt : email.scheduledAt)}
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={email.status} />
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-1">
            <Link
              to={`/emails/${email.id}`}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-brand-600"
              title="Preview email"
            >
              <Eye className="h-4 w-4" />
            </Link>
            {email.previewUrl && (
              <a
                href={email.previewUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-brand-600"
                title="Open Ethereal preview"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            {!isSent && email.status === 'failed' && onRetry && (
              <button
                onClick={() => onRetry(email.id)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-emerald-600"
                title="Retry"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
            {!isSent && email.status === 'scheduled' && onCancel && (
              <button
                onClick={() => onCancel(email.id)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-rose-600"
                title="Cancel"
              >
                <XCircle className="h-4 w-4" />
              </button>
            )}
          </div>
        </td>
      </tr>
    ),
    [isSent, onRetry, onCancel],
  );

  if (!loading && items.length === 0) {
    return (
      <EmptyState
        title={emptyTitle ?? (isSent ? 'No sent emails yet' : 'No scheduled emails yet')}
        description={
          emptyDescription ??
          (isSent ? 'Emails you send will show up here.' : 'Compose an email and schedule a send to get started.')
        }
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
      <table className="min-w-full divide-y divide-slate-200">
        <thead>
          <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Subject</th>
            <th className="px-4 py-3">{isSent ? 'Sent time' : 'Scheduled time'}</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{loading ? <SkeletonRows /> : items.map(renderRow)}</tbody>
      </table>
    </div>
  );
}