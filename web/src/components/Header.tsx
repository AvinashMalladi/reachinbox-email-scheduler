import { useEffect, useState } from 'react';
import { LogOut, Slack } from 'lucide-react';
import type { AuthUser, SlackStatus } from '../types/api';
import { apiGet } from '../lib/api';
import { Button } from './ui';

export function Header({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [slack, setSlack] = useState<SlackStatus | null>(null);

  useEffect(() => {
    apiGet<SlackStatus>('/api/slack/status').then(setSlack).catch(() => setSlack(null));
  }, []);

  const connectSlack = () => {
    window.location.href = '/api/slack/connect?redirect=/dashboard';
  };

  const initials = (user.name ?? user.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">
            RI
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-800">ReachInbox</p>
            <p className="text-xs text-slate-500">Email Scheduler</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {slack && (
            <button
              onClick={connectSlack}
              className={
                'hidden items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium ring-1 transition-colors sm:inline-flex ' +
                (slack.connected
                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100'
                  : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50')
              }
              title={slack.connected ? 'Slack connected — click to reconnect' : 'Get notified when a rate limit is hit'}
            >
              <Slack className="h-4 w-4" />
              {slack.connected ? 'Slack connected' : 'Connect Slack'}
            </button>
          )}

          <div className="hidden text-right leading-tight sm:block">
            <p className="text-sm font-medium text-slate-800">{user.name ?? 'User'}</p>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>

          {user.avatar ? (
            <img
              src={user.avatar}
              alt={user.name ?? user.email}
              className="h-9 w-9 rounded-full ring-1 ring-slate-200"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 ring-1 ring-brand-200">
              {initials || 'U'}
            </div>
          )}

          <Button variant="ghost" onClick={onLogout} className="px-2" aria-label="Logout" title="Logout">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </div>
    </header>
  );
}