// Presence (SPEC 4.8, D-018 item 5): co-writers' carets and selections in their avatar colors,
// and the list of who's here for the toolbar avatars and the Drafts tab.
import type { Identity } from '@wr/shared';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

/** What each browser publishes about itself (besides the cursor, which y-prosemirror adds). */
export interface PresenceUser extends Identity {
  /** y-prosemirror requires a 6-digit hex here; we style with CSS variables instead. */
  color: number;
  hex: string;
}

const HEX = ['#1F3F6B', '#4A2A63', '#2E4A25'];

export function presenceUser(identity: Identity): PresenceUser {
  return { ...identity, hex: HEX[identity.color % HEX.length]! };
}

/** Everyone else in this episode, one entry per person (a writer may have two tabs open). */
export function othersPresent(awareness: Awareness, me: Identity): PresenceUser[] {
  const seen = new Map<string, PresenceUser>();
  awareness.getStates().forEach((state, clientId) => {
    const user = (state as { user?: PresenceUser }).user;
    if (!user || clientId === awareness.clientID || user.userId === me.userId) return;
    if (!seen.has(user.userId)) seen.set(user.userId, user);
  });
  return [...seen.values()];
}

const SHOW_LABEL_MS = 1500;
const PAUSE_MS = 2000;

/**
 * Caret and selection builders for y-prosemirror's cursor plugin. The caret is a 2px line in
 * the writer's color; their name shows on hover, and for 1.5 s when they start typing again
 * after a pause. y-prosemirror reuses each caret element, so the label is toggled in place.
 *
 * "Starts typing" comes from the document, not the cursor: Yjs anchors a cursor to the
 * character after it, so a writer's cursor position doesn't change while they type. Each
 * remote transaction says whose clock advanced, which is exactly who just typed.
 */
export function caretStyle(doc: Y.Doc) {
  const carets = new Map<number, HTMLElement>();
  const lastTyped = new Map<number, number>();
  const timers = new Map<number, ReturnType<typeof setTimeout>>();

  const flash = (clientId: number) => {
    const el = carets.get(clientId);
    if (!el?.isConnected) return;
    el.classList.add('show');
    clearTimeout(timers.get(clientId));
    timers.set(
      clientId,
      setTimeout(() => el.classList.remove('show'), SHOW_LABEL_MS),
    );
  };

  doc.on('afterTransaction', (tr: Y.Transaction) => {
    if (tr.local) return;
    const now = Date.now();
    tr.afterState.forEach((clock, clientId) => {
      if (clock === tr.beforeState.get(clientId)) return;
      const previous = lastTyped.get(clientId);
      lastTyped.set(clientId, now);
      if (previous === undefined || now - previous >= PAUSE_MS) flash(clientId);
    });
  });

  return {
    cursorBuilder(user: Partial<PresenceUser>, clientId: number): HTMLElement {
      const caret = document.createElement('span');
      caret.className = `rc rc-${(user.color ?? 0) % HEX.length}`;
      caret.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.className = 'rc-name';
      label.textContent = user.name ?? '';
      caret.append(label);
      const isNew = !carets.has(clientId);
      carets.set(clientId, caret);
      if (isNew) queueMicrotask(() => flash(clientId)); // show who just arrived
      return caret;
    },
    selectionBuilder(user: Partial<PresenceUser>) {
      return { class: `rs rs-${(user.color ?? 0) % HEX.length}` };
    },
  };
}
