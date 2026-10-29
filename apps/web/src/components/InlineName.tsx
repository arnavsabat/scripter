// A name that renames where it stands (D-109): click the text (or Enter on it) and it becomes a
// field in the same type, in the same place; Enter or leaving saves, Esc keeps the old name. The
// click stays on the name, so the row around it still opens on a click anywhere else.
import { useState } from 'react';

export function InlineName({
  name,
  onRename,
  label,
}: {
  name: string;
  /** Null when this person can't rename it: plain text. */
  onRename: ((name: string) => void) | null;
  /** What the field renames, for screen readers ("Rename what-if"). */
  label: string;
}) {
  const [editing, setEditing] = useState(false);
  if (!onRename) return <span className="iname">{name}</span>;
  if (!editing)
    return (
      <span
        className="iname can"
        role="button"
        tabIndex={0}
        title="Rename"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setEditing(true);
          }
        }}
      >
        {name}
      </span>
    );
  const finish = (input: HTMLInputElement, save: boolean) => {
    setEditing(false);
    const next = input.value.trim();
    if (save && next && next !== name) onRename(next);
  };
  return (
    <input
      className="iname field"
      aria-label={label}
      defaultValue={name}
      maxLength={120}
      ref={(el) => {
        if (el && document.activeElement !== el) {
          el.focus();
          el.select();
        }
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(e.currentTarget, true);
        else if (e.key === 'Escape') finish(e.currentTarget, false);
      }}
      onBlur={(e) => finish(e.currentTarget, true)}
    />
  );
}
