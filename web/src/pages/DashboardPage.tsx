import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Inbox,
  PenSquare,
  Search,
  Send,
  Slack,
  Users,
  Workflow,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { apiGet, apiPost } from '../lib/api';
import { useToast } from '../lib/toast';
import type {
  EmailItem,
  EmailStats,
  ListResponse,
  MailerMode,
  SearchResponse,
  SystemStatus,
} from '../types/api';
import { Header } from '../components/Header';
import { ComposeModal } from '../components/ComposeModal';
import { EmailTable } from '../components/EmailTable';
import { Button, Card, Spinner } from '../components/ui';

type Tab = 'scheduled' | 'sent';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'scheduled', label: 'Scheduled Emails' },
  { id: 'sent', label: 'Sent Emails' },
];

const MAILER_LABEL: Record<MailerMode, string> = {
  ethereal: 'Ethereal SMTP',
  'brevo-fallback': 'Ethereal → Brevo fallback',
  'smtp-relay': 'SMTP relay',
  unconfigured: 'Not configured',
};

const MAILER_DOT: Record<MailerMode, string> = {
  ethereal: 'bg-emerald-500',
  'brevo-fallback': 'bg-amber-500',
  'smtp-relay': 'bg-blue-500',
  unconfigured: 'bg-slate-400',
};

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

function StatCard({
  icon,
  label,
  value,
  caption,
  chipClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string | undefined;
  caption?: string;
  chipClass: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200/80 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1.5 text-[26px] font-bold leading-none text-slate-800">{value ?? '—'}</p>
        </div>
        <span className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white ' + chipClass}>
          {icon}
        </span>
      </div>
      {caption && <p className="mt-2 text-xs text-slate-400">{caption}</p>}
    </div>
  );
}

function RailLine({
  dotClass,
  title,
  sub,
}: {
  dotClass: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className={'mt-1.5 h-2 w-2 shrink-0 rounded-full ' + dotClass} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-700">{title}</p>
        {sub && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{sub}</p>}
      </div>
    </div>
  );
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

  const [stats, setStats] = useState<EmailStats | null>(null);
  const [system, setSystem] = useState<SystemStatus | null>(null);

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

  const refreshStats = useCallback(() => {
    apiGet<EmailStats>('/api/emails/stats').then(setStats).catch(() => undefined);
  }, []);

  const refreshSystem = useCallback(() => {
    apiGet<SystemStatus>('/api/system/status').then(setSystem).catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshStats();
    refreshSystem();
    const statsTimer = setInterval(refreshStats, 15000);
    const systemTimer = setInterval(refreshSystem, 10000);
    return () => {
      clearInterval(statsTimer);
      clearInterval(systemTimer);
    };
  }, [refreshStats, refreshSystem]);

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

  const queues = system?.queues ?? null;
  const mailer = system?.mailer;
  const queueBusy = (queues?.waiting ?? 0) + (queues?.active ?? 0) + (queues?.delayed ?? 0) > 0;

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen">
      <Header
        user={user!}
        onLogout={() => logout().catch(() => undefined)}
      />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <section className="rounded-3xl bg-gradient-to-r from-blue-700 via-blue-600 to-blue-500 px-6 py-6 text-white shadow-lg sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-blue-100">{today}</p>
              <h1 className="mt-1 text-2xl font-bold">Operations Center</h1>
              <p className="mt-1 text-sm text-blue-100">
                Monitor scheduling, delivery and search for your campaigns in real time.
              </p>
            </div>
            <Button
              onClick={() => setComposeOpen(true)}
              className="bg-brand-700 shadow-md ring-1 ring-white/40 hover:bg-brand-800"
            >
              <PenSquare className="h-4 w-4" />
              Compose New Email
            </Button>
          </div>
        </section>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard
            icon={<CalendarClock className="h-4 w-4" />}
            label="In queue"
            value={(stats?.scheduled ?? 0) + (stats?.sending ?? 0)}
            caption={queueBusy ? `${queues?.waiting ?? 0} waiting · ${queues?.active ?? 0} active` : 'Nothing pending right now'}
            chipClass="bg-blue-600"
          />
          <StatCard
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Delivered"
            value={stats?.sent}
            caption={`${stats?.sentToday ?? 0} sent today`}
            chipClass="bg-emerald-600"
          />
          <StatCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Failed"
            value={stats?.failed}
            caption={queues && queues.failed > 0 ? `${queues.failed} failed job${queues.failed === 1 ? '' : 's'} in queue` : 'No failures in the queue'}
            chipClass="bg-rose-600"
          />
          <StatCard
            icon={<Users className="h-4 w-4" />}
            label="Senders"
            value={stats?.senders}
            caption={`${stats?.total ?? 0} emails tracked`}
            chipClass="bg-slate-600"
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card
            title="Campaigns"
            icon={<Inbox className="h-4 w-4 text-blue-600" />}
            badge={
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                {stats?.total ?? '—'} total
              </span>
            }
          >
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

            <div className="mt-4">
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
                        (active ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700')
                      }
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {searching ? (
                <div className="flex items-center justify-center rounded-xl bg-slate-50 py-16">
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
                  emptyDescription={searchActive ? 'Try a different search term.' : undefined}
                />
              )}
            </div>
          </Card>

          <aside className="space-y-4">
            <Card
              title="Queue monitor"
              icon={<Workflow className="h-4 w-4 text-blue-600" />}
              badge={
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  live
                </span>
              }
            >
              <a
                href={system?.adminUrl ?? '/admin/queues'}
                target="_blank"
                rel="noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-glow ring-1 ring-blue-300 transition hover:brightness-110"
              >
                <ExternalLink className="h-4 w-4" />
                Open live queue monitor
              </a>
              <p className="mt-2 text-center text-[11px] text-slate-400">
                BullMQ queue book — opens in a new tab
              </p>

              {queues ? (
                <>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {[
                      { label: 'Waiting', value: queues.waiting, tint: queueBusy ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-600' },
                      { label: 'Active', value: queues.active, tint: queues.active > 0 ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-50 text-slate-600' },
                      { label: 'Delayed', value: queues.delayed, tint: queues.delayed > 0 ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-600' },
                    ].map((c) => (
                      <div key={c.label} className={'rounded-lg px-2 py-2 text-center ' + c.tint}>
                        <p className="text-lg font-bold leading-none">{c.value}</p>
                        <p className="mt-1 text-[10px] font-medium uppercase tracking-wide">{c.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-emerald-50 px-2 py-1.5 text-center text-xs font-semibold text-emerald-700">
                      {queues.completed} completed
                    </div>
                    <div
                      className={
                        'rounded-lg px-2 py-1.5 text-center text-xs font-semibold ' +
                        (queues.failed > 0 ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-500')
                      }
                    >
                      {queues.failed} failed
                    </div>
                  </div>
                </>
              ) : (
                <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  Queue counters are unavailable — open the monitor for the full picture.
                </p>
              )}
            </Card>

            <Card title="Delivery & search" icon={<Send className="h-4 w-4 text-blue-600" />}>
              <div className="space-y-3">
                {mailer ? (
                  <RailLine
                    dotClass={MAILER_DOT[mailer.mode]}
                    title={MAILER_LABEL[mailer.mode]}
                    sub={
                      mailer.mode === 'ethereal'
                        ? 'Primary mailer per the spec — delivering over Ethereal SMTP.'
                        : mailer.mode === 'brevo-fallback'
                          ? 'Ethereal is unreachable on this host, so delivery falls back to the Brevo HTTP API.'
                          : mailer.mode === 'smtp-relay'
                            ? 'Custom SMTP relay configured.'
                            : 'No mailer credentials configured.'
                    }
                  />
                ) : (
                  <RailLine dotClass="bg-slate-400" title="Checking mailer…" />
                )}

                <div className="border-t border-slate-100" />

                <RailLine
                  dotClass={
                    system?.elasticsearch.reachable
                      ? 'bg-emerald-500'
                      : system?.elasticsearch.enabled
                        ? 'bg-amber-500'
                        : 'bg-slate-400'
                  }
                  title={
                    system?.elasticsearch.reachable
                      ? 'Elasticsearch indexing'
                      : system?.elasticsearch.enabled
                        ? 'Search fallback (SQL)'
                        : 'Search disabled'
                  }
                  sub={
                    system?.elasticsearch.enabled
                      ? `Index ${system.elasticsearch.index} ` + (system.elasticsearch.reachable ? 'search-ready' : 'unreachable — using SQL LIKE')
                      : 'Set ES_ENABLED=true to enable full-text search.'
                  }
                />
              </div>
            </Card>

            <Card title="Slack alerts" icon={<Slack className="h-4 w-4 text-blue-600" />}>
              {system ? (
                system.slack.connected ? (
                  <RailLine
                    dotClass="bg-emerald-500"
                    title="Connected"
                    sub="Rate-limit alerts are posting to your workspace."
                  />
                ) : system.slack.configured ? (
                  <RailLine
                    dotClass="bg-amber-500"
                    title="Ready to connect"
                    sub="Use the Slack button in the header to authorize."
                  />
                ) : (
                  <RailLine
                    dotClass="bg-slate-400"
                    title="Not configured"
                    sub="SLACK_CLIENT_ID / SECRET are not set."
                  />
                )
              ) : (
                <RailLine dotClass="bg-slate-400" title="Checking…" />
              )}
            </Card>
          </aside>
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