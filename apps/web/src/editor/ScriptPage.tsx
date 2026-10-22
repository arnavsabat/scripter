// The script area: the page on the desk, plus the two things that live in its left margin:
// the element menu (SPEC 4.3, D-014) and the formatting-warning popover (SPEC 4.5, D-014).
import { ELEMENT_MENU, addCueAbove, makeAction, setElementType, typeOf } from '@wr/schema';
import type { EditorView } from 'prosemirror-view';
import { useEffect, type RefObject } from 'react';
import type { Overlay } from '../App';

interface Props {
  mountRef: RefObject<HTMLDivElement | null>;
  view: EditorView | undefined;
  overlay: Overlay;
  setOverlay: (o: Overlay) => void;
}

function blockPosById(view: EditorView, id: string) {
  let found = -1;
  view.state.doc.forEach((node, pos) => {
    if (node.attrs.id === id) found = pos;
  });
  return found;
}

export function ScriptPage({ mountRef, view, overlay, setOverlay }: Props) {
  // A click anywhere outside a margin overlay closes it.
  useEffect(() => {
    if (overlay?.kind !== 'element' && overlay?.kind !== 'warning') return;
    const outside = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.page-overlay')) setOverlay(null);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [overlay?.kind, setOverlay]);

  const currentType = view ? typeOf(view.state.selection.$from.parent) : null;

  return (
    <main className="center">
      <div className="in">
        <div className="desk">
          <div className="page">
            <div ref={mountRef} />
            {view && overlay?.kind === 'element' && (
              <div
                className="menu elmenu page-overlay"
                role="menu"
                aria-label="Element type"
                style={{ top: overlay.top }}
              >
                {ELEMENT_MENU.map((item, i) => (
                  <button
                    key={item.type}
                    type="button"
                    className={`mi${i === overlay.highlighted ? ' hl' : ''}`}
                    role="menuitemradio"
                    aria-checked={item.type === currentType}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setElementType(item.type)(view.state, (tr) => view.dispatch(tr));
                      setOverlay(null);
                    }}
                  >
                    {item.label}
                    <span>
                      <span className="ck">{item.type === currentType ? '✓' : ''}</span>
                      {item.key}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {view && overlay?.kind === 'warning' && (
              <div
                className="menu pop page-overlay"
                role="menu"
                aria-label="Fix formatting"
                style={{ top: overlay.top + 22, left: 144 - 214 }}
              >
                {(
                  [
                    ['Add character cue', addCueAbove],
                    ['Make this action', makeAction],
                  ] as const
                ).map(([label, fix]) => (
                  <button
                    key={label}
                    type="button"
                    className="mi"
                    role="menuitem"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      const pos = blockPosById(view, overlay.blockId);
                      if (pos >= 0) fix(pos)(view.state, (tr) => view.dispatch(tr));
                      setOverlay(null);
                      view.focus();
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
