// A title you rename by clicking it (D-033): the toolbar's episode title and Home's series title.
// Enter saves, Esc keeps the old name, clicking away saves. New scripts open already renaming.
import { useState } from 'react';

interface Props {
  /** What's shown, e.g. "Ep 2 · Undertow". */
  text: string;
  /** The part that's edited, e.g. "Undertow" (the "Ep 2 · " prefix stays fixed). */
  value: string;
  prefix?: string;
  canRename: boolean;
  onSave: (name: string) => void;
  startEditing?: boolean;
}

export function RenameTitle({ text, value, prefix = '', canRename, onSave, startEditing }: Props) {
  const [editing, setEditing] = useState(!!startEditing && canRename);
  if (!canRename) return <span className="title">{text}</span>;
  if (!editing)
    return (
      <span
        className="title rn"
        role="button"
        tabIndex={0}
        title="Rename"
        onClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setEditing(true);
          }
        }}
      >
        {text}
      </span>
    );
  const finish = (input: HTMLInputElement, save: boolean) => {
    setEditing(false);
    const name = input.value.trim();
    if (save && name && name !== value) onSave(name);
  };
  return (
    <span className="title">
      {prefix}
      <input
        className="ren"
        aria-label="Rename"
        defaultValue={value}
        maxLength={120}
        size={Math.max(12, value.length + 2)}
        ref={(el) => {
          if (el && document.activeElement !== el) {
            el.focus();
            el.select();
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finish(e.currentTarget, true);
          else if (e.key === 'Escape') {
            e.stopPropagation();
            finish(e.currentTarget, false);
          }
        }}
        onBlur={(e) => finish(e.currentTarget, true)}
      />
    </span>
  );
}
