import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Zap, ExternalLink } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { Button } from '../components/ui';

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
                {config?.demoLogin ? (
                  <Button className="w-full" onClick={handleDemo}>
                    <Zap className="h-4 w-4 text-amber-500" />
                    Continue with a demo account
                  </Button>
                ) : null}
                {config?.googleConfigured ? (
                  <div className="pt-1 text-center">
                    <button
                      type="button"
                      onClick={loginWithGoogle}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
                      title="Sign in using Google OAuth"
                    >
                      Sign in with a Google account
                      <ExternalLink className="h-3 w-3" />
                    </button>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                      Opens Google's official sign-in page. No credentials are entered here.
                    </p>
                  </div>
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
        <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-400">
          ReachInbox is a software-engineering assignment — an email-scheduling demo. It does not
          collect, sell, or expose any personal data beyond the demo account you create here.
        </p>
      </div>
    </div>
  );
}