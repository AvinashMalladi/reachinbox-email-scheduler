import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type ToastKind = 'success' | 'error' | 'info';

export type Toast = { id: number; kind: ToastKind; message: string };

type ToastContextValue = { push: (message: string, kind?: ToastKind) => void };

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={
              'rounded-lg px-4 py-3 text-sm shadow-card ring-1 ' +
              (t.kind === 'success'
                ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                : t.kind === 'error'
                  ? 'bg-rose-50 text-rose-800 ring-rose-200'
                  : 'bg-white text-slate-700 ring-slate-200')
            }
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}