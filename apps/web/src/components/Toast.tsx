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

export interface ToastApi {
  show(message: string, undo?: () => void): void;
}

const Ctx = createContext<ToastApi>({ show: () => {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const show = useCallback((message: string, undo?: () => void) => {
    setToast(undo ? { message, undo } : { message });
    setVisible(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), 6000);
  }, []);
  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className={`toast${visible ? ' show' : ''}`} role="status" aria-live="polite">
        {toast?.message}
        {toast?.undo && (
          <button
            type="button"
            onClick={() => {
              toast.undo?.();
              setVisible(false);
            }}
          >
            Undo
          </button>
        )}
      </div>
    </Ctx.Provider>
  );
}
