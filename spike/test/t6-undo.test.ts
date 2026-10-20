// Test 6: undo after a split takes one step, and undo never reverts the other client's edit.
// Undo is the per-user Yjs UndoManager from y-prosemirror (tracks local origins only, SPEC 4.7).
import { afterEach, describe, expect, it } from 'vitest';
import { blocksOf, placeCursor, posIn } from '../src/editor';
import {
  converged,
  evidence,
  keys,
  room,
  SCENE,
  sleep,
  summary,
  texts,
  typeText,
  undoKeys,
  VARIANTS,
  type Room,
} from './helpers';

let r: Room | undefined;
afterEach(() => r?.destroy());

describe.each(VARIANTS)('Test 6: undo (%s)', (variant) => {
  it('one Mod-Z undoes a mid-line split (split + type switch were one transaction)', async () => {
    r = room(variant, SCENE);
    placeCursor(r.a, 1, 'end');
    await typeText(r.a, ' Thunder rolls.');
    r.a.undoManager.stopCapturing(); // a pause in typing, so the split is its own undo step
    const beforeSplit = summary(r.a);
    placeCursor(r.a, 1, 10);
    await keys(r.a, '{Enter}');
    const afterSplit = summary(r.a);
    await undoKeys(r.a);
    const afterOneUndo = summary(r.a);
    await undoKeys(r.a);
    const afterTwoUndos = summary(r.a);
    await r.net.settle();
    evidence('6-split', {
      variant,
      beforeSplit: beforeSplit.slice(1, 3),
      afterSplit: afterSplit.slice(1, 3),
      afterOneUndo: afterOneUndo.slice(1, 3),
      afterTwoUndos: afterTwoUndos.slice(1, 3),
    });
    expect(afterSplit.length).toBe(beforeSplit.length + 1);
    expect(afterOneUndo).toEqual(beforeSplit);
    expect(texts(r.a)[1]).toBe(SCENE[1]!.text); // second undo removes the typing
    expect(afterTwoUndos[1]).toBe(`action: ${SCENE[1]!.text}`);
    expect(converged(r)).toBe(true);
  });

  it('one Mod-Z undoes an Enter that switched the element type (Character → Dialogue)', async () => {
    r = room(variant, SCENE);
    const before = summary(r.a);
    placeCursor(r.a, 2, 'end'); // after "MARA"
    await keys(r.a, '{Enter}');
    const after = summary(r.a);
    await undoKeys(r.a);
    evidence('6-enter-type-switch', {
      variant,
      inserted: after[3],
      undone: summary(r.a).length === before.length,
    });
    expect(after[3]).toBe('dialogue: ');
    expect(summary(r.a)).toEqual(before);
  });

  it('one Mod-Z undoes a Tab type change', async () => {
    r = room(variant, SCENE);
    const before = summary(r.a);
    placeCursor(r.a, 3, 2);
    await keys(r.a, '{Tab}');
    expect(blocksOf(r.a)[3]!.type).toBe('parenthetical');
    await undoKeys(r.a);
    evidence('6-tab', { variant, afterUndo: summary(r.a)[3] });
    expect(summary(r.a)).toEqual(before);
  });

  it("undo never reverts the other client's edit, even in the same line", async () => {
    r = room(variant, SCENE);
    placeCursor(r.a, 1, 0);
    await typeText(r.a, 'AAA ');
    await r.net.settle();
    placeCursor(r.b, 1, 'end');
    await typeText(r.b, ' BBB');
    placeCursor(r.b, 4, 'end');
    await typeText(r.b, ' BBB2');
    await r.net.settle();
    await undoKeys(r.a); // A undoes its own typing only
    await r.net.settle();
    const t = texts(r.b);
    evidence('6-other-client', { variant, line1: t[1], line4: t[4] });
    expect(converged(r)).toBe(true);
    expect(t[1]).toBe(`${SCENE[1]!.text} BBB`);
    expect(t[4]).toBe(`${SCENE[4]!.text} BBB2`);
  });

  describe.each(['blocks', 'default'] as const)('protected nodes: %s', (protect) => {
    it('A undoes a split after B typed into the new line: B’s text must survive', async () => {
      r = room(variant, SCENE, { protect });
      placeCursor(r.a, 1, 10);
      await keys(r.a, '{Enter}');
      await r.net.settle();
      r.b.view.dispatch(r.b.view.state.tr.insertText(' (B was here)', posIn(r.b, 2, 'end')));
      await r.net.settle();
      await sleep(5);
      await undoKeys(r.a);
      await r.net.settle();
      const all = texts(r.a).join('|');
      const survived = all.includes(' (B was here)');
      evidence(`6-undo-split-${protect}`, {
        variant,
        protect,
        survived,
        lines: texts(r.a).slice(1, 3),
      });
      expect(converged(r)).toBe(true);
      // y-prosemirror only protects "paragraph" by default, so undo deletes B's line along with
      // A's split. Protecting every block node name keeps B's text.
      expect(survived).toBe(protect === 'blocks');
    });
  });
});
