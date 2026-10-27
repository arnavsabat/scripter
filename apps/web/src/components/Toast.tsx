// Toasts (SPEC 3.9): bottom center, rise and fade in over 0.2 s, last 6 s, optional Undo.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/** A button in the toast: Undo, or a choice like "Sign out anyway" / "Cancel" (D-050). */
export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastApi {
  show(message: string, actions?: (() => void) | ToastAction[]): void;
}

const Ctx = createContext<ToastApi>({ show: () => {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; actions: ToastAction[] } | null>(null);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const show = useCallback((message: string, actions?: (() => void) | ToastAction[]) => {
    setToast({
      message,
      actions: typeof actions === 'function' ? [{ label: 'Undo', run: actions }] : (actions ?? []),
    });
    setVisible(true);
    clearTimeout(timer.current);
    // Long enough to read: 6 s, more for a long message (up to 15 s).
    timer.current = setTimeout(
      () => setVisible(false),
      Math.min(15_000, Math.max(6000, message.length * 60)),
    );
  }, []);
  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className={`toast${visible ? ' show' : ''}`} role="status" aria-live="polite">
        {toast?.message}
        {toast?.actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={() => {
              // Hide first: an action may show a toast of its own ("Send undone").
              setVisible(false);
              a.run();
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
    </Ctx.Provider>
  );
}
