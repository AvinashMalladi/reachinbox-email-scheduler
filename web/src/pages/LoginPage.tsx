import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Zap } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { Button } from '../components/ui';

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function LoginPage() {
  const { user, loginWithGoogle, demoLogin, config, loading } = useAuth();
  const navigate = useNavigate();
  const { push } = useToast();

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  const handleDemo = async () => {
    try {
      await demoLogin();
      navigate('/dashboard', { replace: true });
    } catch {
      push('Demo login failed — is the server running?', 'error');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 via-slate-50 to-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-white p-8 shadow-modal ring-1 ring-slate-200">
          <div className="flex flex-col items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 shadow-sm">
              <Mail className="h-6 w-6 text-white" />
            </div>
            <h1 className="mt-4 text-xl font-bold text-slate-800">ReachInbox</h1>
            <p className="mt-1 text-sm text-slate-500">Schedule and send cold emails, reliably.</p>
          </div>

          <div className="mt-8 space-y-3">
            {loading ? null : (
              <>
                <Button
                  className="w-full"
                  onClick={loginWithGoogle}
                  disabled={!config?.googleConfigured}
                  title={
                    config?.googleConfigured
                      ? 'Sign in with Google'
                      : 'Google OAuth is not configured on the server'
                  }
                >
                  <GoogleIcon />
                  Continue with Google
                </Button>
                {!config?.googleConfigured && (
                  <p className="text-center text-xs text-slate-400">
                    Google OAuth isn't configured on this server yet — use the demo account below, or add
                    <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 text-[11px]">GOOGLE_CLIENT_ID/SECRET</code>
                    to <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">server/.env</code>.
                  </p>
                )}
                {config?.demoLogin ? (
                  <>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span className="h-px flex-1 bg-slate-200" />
                      or
                      <span className="h-px flex-1 bg-slate-200" />
                    </div>
                    <Button variant="secondary" className="w-full" onClick={handleDemo}>
                      <Zap className="h-4 w-4 text-amber-500" />
                      Continue with Demo account
                    </Button>
                  </>
                ) : null}
              </>
            )}
          </div>

          <p className="mt-8 text-center text-xs leading-relaxed text-slate-400">
            Powered by BullMQ, Redis, PostgreSQL and Ethereal Email.
            <br />
            Search powered by Elasticsearch.
          </p>
        </div>
      </div>
    </div>
  );
}