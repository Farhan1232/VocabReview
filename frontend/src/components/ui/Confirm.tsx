/** Promise-based confirmation dialog: `if (await confirm({...})) ...`. */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Dialog } from './Overlay';
import { Button } from './Button';

interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

const Ctx = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

/** Renders the dialog; wraps the app once. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(v: boolean) => void>(() => {});
  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((res) => (resolver.current = res));
  }, []);
  const close = (v: boolean) => {
    resolver.current(v);
    setOpts(null);
  };
  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Dialog
        open={!!opts}
        onClose={() => close(false)}
        title={opts?.title}
        width={420}
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button data-autofocus variant={opts?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
              {opts?.confirmLabel ?? 'Confirm'}
            </Button>
          </>
        }
      >
        {opts?.body && <div className="text-[13px] leading-relaxed text-fg-2">{opts.body}</div>}
      </Dialog>
    </Ctx.Provider>
  );
}

/** Returns a function that asks a question and resolves to the answer. */
export const useConfirm = () => useContext(Ctx);
