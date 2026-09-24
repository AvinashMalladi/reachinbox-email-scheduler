import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiGet, apiPost, ApiError } from './api';
import type { AuthConfig, AuthUser } from '../types/api';

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  config: AuthConfig | null;
  loginWithGoogle: () => void;
  demoLogin: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AuthConfig | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<{ user: AuthUser }>('/api/auth/me');
      setUser(data.user);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setUser(null);
      else setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    apiGet<AuthConfig>('/api/auth/config')
      .then(setConfig)
      .catch(() => setConfig({ googleConfigured: false, demoLogin: false }));
  }, [refresh]);

  const loginWithGoogle = useCallback(() => {
    window.location.href = '/api/auth/google?redirect=/dashboard';
  }, []);

  const demoLogin = useCallback(async () => {
    await apiPost<AuthUser>('/api/auth/demo');
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await apiPost('/api/auth/logout');
    setUser(null);
    window.location.href = '/';
  }, []);

  const value = useMemo(
    () => ({ user, loading, config, loginWithGoogle, demoLogin, logout, refresh }),
    [user, loading, config, loginWithGoogle, demoLogin, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}