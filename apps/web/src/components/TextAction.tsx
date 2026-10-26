// Clickable text that triggers a feature (SPEC 3.4). One-shot actions bold for 0.7 s as
// confirmation; openers stay bold while `hold` is set. The bold width is reserved in advance
// (the ::after trick in app.css), so bolding never nudges neighbors.
import { useEffect, useRef, useState } from 'react';

interface Props {
  label: string;
  onClick: () => void;
  hold?: boolean;
  className?: string;
  /** Reserve the bold width of a longer label this action turns into (e.g. "Accepted ✓"). */
  reserve?: string;
}

export function TextAction({ label, onClick, hold = false, className = '', reserve }: Props) {
  const [flash, setFlash] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className={`ta ${className}${flash ? ' flash' : ''}${hold ? ' hold' : ''}`}
      data-t={reserve ?? label}
      onClick={() => {
        if (!hold) {
          setFlash(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setFlash(false), 700);
        }
        onClick();
      }}
    >
      {label}
    </button>
  );
}
