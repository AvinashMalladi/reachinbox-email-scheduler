import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Mail } from 'lucide-react';
import { apiGet } from '../lib/api';
import type { EmailItem } from '../types/api';
import { Spinner, StatusBadge } from '../components/ui';

function formatFull(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
}

export function EmailPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const [email, setEmail] = useState<EmailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiGet<EmailItem>(`/api/emails/${id}`)
      .then(setEmail)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load email'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (error || !email) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-4 text-center">
        <p className="text-sm font-medium text-slate-600">{error ?? 'Email not found'}</p>
        <Link to="/dashboard" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 via-slate-50 to-slate-50">
      <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-brand-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Mail className="h-4 w-4 text-brand-600" />
          Message preview
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-4 pb-10 sm:px-6">
        <div className="overflow-hidden rounded-2xl bg-white shadow-modal ring-1 ring-slate-200">
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-xl font-bold text-slate-800">{email.subject || '(no subject)'}</h1>
              <StatusBadge status={email.status} />
            </div>

            <dl className="mt-4 space-y-1.5 text-sm text-slate-600">
              <div className="grid grid-cols-[64px_1fr] gap-2">
                <dt className="font-medium text-slate-400">From</dt>
                <dd className="truncate">{email.senderEmail ?? 'ReachInbox scheduler'}</dd>
              </div>
              <div className="grid grid-cols-[64px_1fr] gap-2">
                <dt className="font-medium text-slate-400">To</dt>
                <dd className="truncate">{email.recipient}</dd>
              </div>
              <div className="grid grid-cols-[64px_1fr] gap-2">
                <dt className="font-medium text-slate-400">Sent</dt>
                <dd>{formatFull(email.sentAt)}</dd>
              </div>
              <div className="grid grid-cols-[64px_1fr] gap-2">
                <dt className="font-medium text-slate-400">Batch</dt>
                <dd>{email.batchId ? email.batchId.slice(0, 8) : '—'}</dd>
              </div>
            </dl>
          </div>

          <div className="px-6 py-6">
            <div className="whitespace-pre-wrap break-words leading-relaxed text-slate-700">{email.body}</div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
            {email.previewUrl ? (
              <a
                href={email.previewUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open in Ethereal inbox
              </a>
            ) : (
              <p className="text-xs leading-relaxed text-slate-400">
                Delivered via the hosted fallback path (this host blocks Ethereal SMTP).{' '}
                <span className="font-medium text-slate-500">When run locally, this action links to Ethereal's live preview.</span>
              </p>
            )}
            {email.lastError && <p className="text-xs font-medium text-rose-500">Error: {email.lastError}</p>}
          </div>
        </div>
      </main>
    </div>
  );
}