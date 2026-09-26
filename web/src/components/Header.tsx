import { useEffect, useState } from 'react';
import { LogOut, Slack, Workflow, X } from 'lucide-react';
import type { AuthUser, SlackStatus, SlackAlert } from '../types/api';
import { apiGet } from '../lib/api';
import { Button } from './ui';

export function Header({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [slack, setSlack] = useState<SlackStatus | null>(null);
  const [alerts, setAlerts] = useState<SlackAlert[]>([]);
  const [showSlackModal, setShowSlackModal] = useState(false);
  const [dismissedAt, setDismissedAt] = useState(0);

  useEffect(() => {
    apiGet<SlackStatus>('/api/slack/status').then(setSlack).catch(() => setSlack(null));
    apiGet<{ items: SlackAlert[] }>('/api/slack/alerts')
      .then((r) => setAlerts(r.items))
      .catch(() => setAlerts([]));
  }, []);

  const goToSlack = () => {
    if (!slack?.configured) return;
    window.location.href = '/api/slack/connect?redirect=/dashboard';
  };

  const latestAlert = alerts.find((a) => new Date(a.created_at).getTime() > dismissedAt) ?? null;

  const initials = (user.name ?? user.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  return (
    <>
      {latestAlert && (
        <div className="bg-amber-50 text-amber-900 ring-1 ring-amber-200 sm:sticky sm:top-16 sm:z-30">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 text-xs sm:px-6">
            <p>
              Rate limit reached for <span className="font-semibold">{latestAlert.sender_email}</span> — next
              emails delayed until{' '}
              <span className="font-semibold">{new Date(latestAlert.next_window_start).toLocaleTimeString()}</span>.
              {latestAlert.delivered_slack
                ? ' You were notified in Slack.'
                : ' Connect Slack to get these alerts in your workspace.'}
            </p>
            <button
              onClick={() => setDismissedAt(Date.now())}
              className="shrink-0 rounded-md p-1 hover:bg-amber-200/60"
              aria-label="Dismiss alert"
              title="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-40 bg-gradient-to-r from-blue-800 via-blue-700 to-blue-600 text-white shadow-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-sm font-bold text-white ring-1 ring-white/25">
              RI
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-white">ReachInbox</p>
              <p className="text-xs text-blue-100/90">Email Scheduler</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/admin/queues"
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-white/20 transition-colors hover:bg-white/20 sm:inline-flex"
              title="Open the live BullMQ queue dashboard in a new tab"
            >
              <Workflow className="h-4 w-4" />
              Queue monitor
            </a>

            {slack && (
              <button
                onClick={() => setShowSlackModal(true)}
                className={
                  'hidden items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium ring-1 transition-colors sm:inline-flex ' +
                  (slack.connected
                    ? 'bg-emerald-400/20 text-emerald-100 ring-emerald-200/30 hover:bg-emerald-400/30'
                    : slack.configured
                      ? 'bg-white/10 text-white ring-white/20 hover:bg-white/20'
                      : 'bg-white/5 text-blue-100/60 ring-white/10 cursor-not-allowed')
                }
                title={
                  slack.connected
                    ? 'Slack connected — click to reconnect'
                    : slack.configured
                      ? 'Get notified when a rate limit is hit'
                      : 'Slack is not configured on the server'
                }
              >
                <Slack className="h-4 w-4" />
                {slack.connected ? 'Slack connected' : 'Connect Slack'}
              </button>
            )}

            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-medium text-white">{user.name ?? 'User'}</p>
              <p className="text-xs text-blue-100/90">{user.email}</p>
            </div>

            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name ?? user.email}
                className="h-9 w-9 rounded-full ring-1 ring-white/30"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-xs font-semibold text-white ring-1 ring-white/25">
                {initials || 'U'}
              </div>
            )}

            <Button
              variant="ghost"
              onClick={onLogout}
              className="px-2 text-blue-50 hover:bg-white/10 hover:text-white"
              aria-label="Logout"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      {showSlackModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setShowSlackModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-semibold text-slate-800">
                <Slack className="h-5 w-5 text-emerald-600" />
                {slack?.connected ? 'Slack is connected' : 'Connect Slack notifications'}
              </h3>
              <button
                onClick={() => setShowSlackModal(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {slack?.connected ? (
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Rate-limit alerts are being posted to <span className="font-semibold">{slack.team ?? 'your workspace'}</span>
                {slack.channelId ? ` (channel #${slack.channelId})` : ''}. Clicking through below will re-authorize.
              </p>
            ) : (
              <>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  When any sender hits its hourly limit, ReachInbox posts a heads-up to a Slack channel. Connecting
                  takes about 30 seconds:
                </p>
                <ol className="mt-3 space-y-2 text-sm text-slate-600">
                  <li>
                    <span className="font-semibold text-slate-800">1.</span>{' '}
                    {slack?.teamDomain ? (
                      <>
                        Slack will ask you to sign in to{' '}
                        <span className="font-semibold text-slate-800">{slack.teamDomain}.slack.com</span> — that
                        workspace is already pre-selected, so there's no workspace-URL step.
                      </>
                    ) : (
                      <>
                        Slack will ask you to sign in and pick the workspace to install the app into. If it asks for a
                        workspace URL, that's Slack's own screen — typing it is expected.
                      </>
                    )}
                  </li>
                  <li>
                    <span className="font-semibold text-slate-800">2.</span> Review the permissions and{' '}
                    <span className="font-semibold text-slate-800">Allow</span> the <em>ReachInbox</em> app (it only
                    sends messages and reads channels).
                  </li>
                  <li>
                    <span className="font-semibold text-slate-800">3.</span> You're redirected back here and the header
                    badge turns green.
                  </li>
                </ol>
                <p className="mt-3 text-xs leading-relaxed text-slate-400">
                  Alerts are posted in the workspace's <code>#general</code> channel. Don't worry if you'd rather not —
                  rate-limit notices also appear in a banner here.
                </p>
              </>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowSlackModal(false)}>
                {slack?.connected ? 'Close' : 'Not now'}
              </Button>
              {!slack?.connected && (
                <Button onClick={goToSlack}>
                  {slack?.configured ? 'Continue to Slack' : 'Slack is not configured'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}