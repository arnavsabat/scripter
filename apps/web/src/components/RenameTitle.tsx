// A title you rename by clicking it (D-033): the toolbar's episode title and Home's series title.
// Enter saves, Esc keeps the old name, clicking away saves. New scripts open already renaming.
import { useState } from 'react';
import { fitToText } from './fitToText';

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
      {/* "Ep 2" without its " · " while the field is open: the field's box would cover the dot
          and leave a sliver of it showing (D-109). */}
      {prefix && <span className="pre">{prefix.replace(/\s*·\s*$/, '')}</span>}
      <input
        className={`ren${prefix ? ' after-pre' : ''}`}
        aria-label="Rename"
        defaultValue={value}
        maxLength={120}
        ref={(el) => {
          if (el && document.activeElement !== el) {
            fitToText(el); // as wide as the name, then as wide as what's typed (D-110)
            el.focus();
            el.select();
          }
        }}
        onInput={(e) => fitToText(e.currentTarget)}
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
