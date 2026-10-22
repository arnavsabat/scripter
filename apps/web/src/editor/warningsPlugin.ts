// Formatting warnings (SPEC 4.5, D-014): a small hollow triangle in the left margin beside the
// broken line. Recomputed from the document on every change (spike finding F3), never mapped.
import { findIssues, type FormattingIssue } from '@wr/schema';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

export const warningsKey = new PluginKey<{ issues: FormattingIssue[]; decos: DecorationSet }>(
  'wr-warnings',
);

const LABEL = 'Dialogue with no character cue';

export function warningsPlugin(onOpen: (blockId: string, anchor: HTMLElement) => void) {
  const build = (doc: Parameters<typeof findIssues>[0]) => {
    const issues = findIssues(doc);
    const decos = DecorationSet.create(
      doc,
      issues.map((issue) =>
        Decoration.widget(
          issue.pos + 1,
          () => {
            const button = document.createElement('button');
            button.className = 'warn';
            button.type = 'button';
            button.contentEditable = 'false';
            button.title = LABEL;
            button.setAttribute('aria-label', `${LABEL}: show fixes`);
            button.innerHTML =
              '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5 11 10.5H1Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
            button.addEventListener('mousedown', (e) => e.preventDefault()); // keep the cursor where it is
            button.addEventListener('click', () => onOpen(issue.blockId, button));
            return button;
          },
          { key: `warn-${issue.blockId}`, side: -1, ignoreSelection: true },
        ),
      ),
    );
    return { issues, decos };
  };
  return new Plugin({
    key: warningsKey,
    state: {
      init: (_, state) => build(state.doc),
      apply: (tr, value, _old, state) => (tr.docChanged ? build(state.doc) : value),
    },
    props: { decorations: (state) => warningsKey.getState(state)?.decos },
  });
}
