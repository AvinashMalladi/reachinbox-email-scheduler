import { useCallback, useEffect, useRef, useState } from 'react';
import { PenSquare, Search } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { apiGet, apiPost } from '../lib/api';
import { useToast } from '../lib/toast';
import type { EmailItem, ListResponse, SearchResponse } from '../types/api';
import { Header } from '../components/Header';
import { ComposeModal } from '../components/ComposeModal';
import { EmailTable } from '../components/EmailTable';
import { Button, Spinner } from '../components/ui';

type Tab = 'scheduled' | 'sent';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'scheduled', label: 'Scheduled Emails' },
  { id: 'sent', label: 'Sent Emails' },
];

function toEmailItem(s: SearchResponse['items'][number]): EmailItem {
  const scheduledAt = s.scheduledAt ? new Date(s.scheduledAt).toISOString() : new Date().toISOString();
  const sentAt = s.sentAt ? new Date(s.sentAt).toISOString() : null;
  return {
    id: s.id,
    recipient: s.recipient,
    subject: s.subject,
    body: s.body,
    status: s.status,
    scheduledAt,
    sentAt,
    senderEmail: null,
    previewUrl: null,
    lastError: null,
    batchId: null,
    createdAt: sentAt ?? scheduledAt,
  };
}

export function DashboardPage() {
  const { user, logout } = useAuth();
  const { push } = useToast();

  const [tab, setTab] = useState<Tab>('scheduled');
  const [items, setItems] = useState<EmailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);

  const [query, setQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const [searching, setSearching] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchList = useCallback(
    async (mode: Tab, q: string) => {
      const params = new URLSearchParams({ limit: '100' });
      if (mode === 'scheduled') params.set('status', 'scheduled');
      if (q.trim()) params.set('q', q.trim());

      const data = await apiGet<ListResponse<EmailItem>>(`/api/emails?${params.toString()}`);
      setItems(data.items);
      setLoading(false);
    },
    [],
  );

  const fetchSearch = useCallback(async (q: string) => {
    setSearching(true);
    try {
      const data = await apiGet<SearchResponse>(`/api/emails/search?q=${encodeURIComponent(q)}`);
      setItems(data.items.map(toEmailItem));
      setSearchActive(true);
    } finally {
      setSearching(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchList(tab, query);
  }, [tab, fetchList]);

  useEffect(() => {
    const timer = setInterval(() => fetchList(tab, query).catch(() => undefined), 5000);
    return () => clearInterval(timer);
  }, [tab, query, fetchList]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      setSearchActive(false);
      setLoading(true);
      fetchList(tab, '');
      return;
    }
    debounceRef.current = setTimeout(() => fetchSearch(q), 450);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const retry = useCallback(
    async (id: string) => {
      try {
        await apiPost(`/api/emails/${id}/retry`);
        push('Email queued for retry', 'success');
        fetchList(tab, query.trim());
      } catch (err) {
        push('Retry failed', 'error');
      }
    },
    [push, tab, query, fetchList],
  );

  const cancel = useCallback(
    async (id: string) => {
      try {
        await apiPost(`/api/emails/${id}/cancel`);
        push('Email cancelled', 'success');
        fetchList(tab, query.trim());
      } catch (err) {
        push('Cancel failed', 'error');
      }
    },
    [push, tab, query, fetchList],
  );

  return (
    <div className="min-h-screen">
      <Header
        user={user!}
        onLogout={() => logout().catch(() => undefined)}
      />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Email Campaigns</h1>
            <p className="mt-0.5 text-sm text-slate-500">Schedule a batch of emails or review what has already been sent.</p>
          </div>
          <Button onClick={() => setComposeOpen(true)}>
            <PenSquare className="h-4 w-4" />
            Compose New Email
          </Button>
        </div>

        <div className="mt-6">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by email, subject or body…"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          {searchActive && (
            <p className="mt-2 text-xs text-slate-500">
              Showing search results via Elasticsearch (falls back to SQL when unavailable)
            </p>
          )}
        </div>

        <div className="mt-6">
          <div className="mb-3 flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {TABS.map((t) => {
              const active = !searchActive && tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setTab(t.id);
                    setQuery('');
                    setSearchActive(false);
                  }}
                  className={
                    'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ' +
                    (active ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')
                  }
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {searching ? (
            <div className="flex items-center justify-center rounded-xl bg-white py-16 ring-1 ring-slate-200">
              <Spinner className="h-6 w-6" />
            </div>
          ) : (
            <EmailTable
              mode={tab}
              items={items}
              loading={loading && !searchActive}
              onRetry={retry}
              onCancel={cancel}
              emptyTitle={searchActive ? 'No matches found' : undefined}
              emptyDescription={
                searchActive ? 'Try a different search term.' : undefined
              }
            />
          )}
        </div>
      </main>

      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onScheduled={() => {
          setTab('scheduled');
          setQuery('');
          fetchList('scheduled', '');
        }}
      />
    </div>
  );
}