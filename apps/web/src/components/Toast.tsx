import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ToastAction = { label: string; onClick: () => void };
export type ToastInput = {
  message: string;
  /** A link shown first, as the start of the sentence ("Sign-in" to …, D-043). */
  lead?: ToastAction;
  action?: ToastAction;
  durationMs?: number;
};
type Toast = ToastInput & { id: number };

type ToastApi = { show: (toast: ToastInput) => void; dismiss: (id: number) => void };

const ToastContext = createContext<ToastApi | null>(null);

/** Toasts: bottom-center on mobile (above the practice buttons), top-right on desktop (clear of them), auto-dismiss, aria-live (PRD §9.7). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (toast: ToastInput) => {
      const id = nextId.current++;
      // A repeated message replaces the previous copy instead of stacking.
      setToasts((all) => [...all.filter((t) => t.message !== toast.message), { ...toast, id }]);
      window.setTimeout(() => dismiss(id), toast.durationMs ?? 5000);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-44 z-50 flex flex-col items-center gap-2 px-4 md:inset-x-auto md:top-24 md:end-6 md:bottom-auto md:max-w-sm md:items-end"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex max-w-md items-center gap-3 rounded-[14px] border border-[rgba(139,108,255,0.35)] bg-surface-2 px-4 py-3 text-sm shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
          >
            <span>
              {t.lead && (
                <>
                  <button
                    type="button"
                    className="font-semibold text-accent underline underline-offset-2 hover:text-text"
                    onClick={() => {
                      t.lead?.onClick();
                      dismiss(t.id);
                    }}
                  >
                    {t.lead.label}
                  </button>{' '}
                </>
              )}
              {t.message}
            </span>
            {t.action && (
              <button
                type="button"
                className="shrink-0 font-semibold text-accent underline-offset-2 hover:underline"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
