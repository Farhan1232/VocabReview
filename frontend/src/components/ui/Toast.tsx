/** Short messages in the corner of the screen. */
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from './cn';

type Tone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  tone: Tone;
  title: string;
  body?: string;
}

const Ctx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});

/**
 * Renders the messages; wraps the app once. They sit at the bottom left, away from the drawer's Add and Save
 * buttons, and clicks pass through them so a message can never swallow a click meant for the screen.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), t.tone === 'error' ? 7000 : 3500);
  }, []);
  const Icon = { success: CheckCircle2, error: AlertTriangle, info: Info };
  return (
    <Ctx.Provider value={push}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          className="pointer-events-none fixed bottom-4 left-4 z-[70] flex w-[340px] flex-col gap-2"
        >
          {toasts.map((t) => {
            const ToneIcon = Icon[t.tone];
            return (
              <div
                key={t.id}
                className="flex animate-pop gap-2.5 rounded-lg border border-line-2 bg-surface-2/95 px-3 py-2.5 shadow-pop backdrop-blur"
              >
                <ToneIcon
                  className={cn(
                    'mt-0.5 size-4 shrink-0',
                    t.tone === 'success' && 'text-accent',
                    t.tone === 'error' && 'text-danger',
                    t.tone === 'info' && 'text-st-new',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-fg">{t.title}</div>
                  {t.body && <div className="mt-0.5 text-[12px] text-muted">{t.body}</div>}
                </div>
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => setToasts((a) => a.filter((x) => x.id !== t.id))}
                  className="pointer-events-auto text-faint hover:text-fg"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}

/** Returns a function that shows a message. */
export const useToast = () => useContext(Ctx);
