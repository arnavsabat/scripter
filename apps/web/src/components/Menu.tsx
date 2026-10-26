// The shared menu style (SPEC 3.9): draft switcher and Share. Keyboard-navigable (SPEC 3.11):
// focus moves to the current item on open, arrows move, Enter picks, Esc closes.
import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from 'react';

export interface MenuItem {
  label: string;
  hint?: string;
  onSelect: () => void;
  current?: boolean;
  /** A thin line above this item (e.g. before "Remove from series"). */
  separated?: boolean;
}

interface Props {
  items: MenuItem[];
  onClose: () => void;
  style?: CSSProperties;
  label: string;
}

export function Menu({ items, onClose, style, label }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const buttons = ref.current?.querySelectorAll<HTMLButtonElement>('.mi');
    const start = Math.max(
      0,
      items.findIndex((i) => i.current),
    );
    buttons?.[start]?.focus();
    const outside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    // Defer so the click that opened the menu doesn't close it.
    const t = setTimeout(() => document.addEventListener('mousedown', outside));
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', outside);
    };
  }, [items, onClose]);

  const onKeyDown = (e: KeyboardEvent) => {
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('.mi') ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = (i + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length;
      buttons[next]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div
      ref={ref}
      className="menu below"
      role="menu"
      aria-label={label}
      style={style}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => (
        <div key={item.label} style={{ display: 'contents' }}>
          {item.separated && <div className="sep" role="separator" />}
          <button
            type="button"
            className="mi"
            role="menuitem"
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            {item.label}
            <span>{item.current ? '✓' : (item.hint ?? '')}</span>
          </button>
        </div>
      ))}
    </div>
  );
}
