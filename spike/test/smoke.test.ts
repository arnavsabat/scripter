import { afterEach, describe, expect, it } from 'vitest';
import { blocksOf, placeCursor } from '../src/editor';
import { converged, keys, room, SCENE, summary, typeText, VARIANTS, type Room } from './helpers';

let r: Room | undefined;
afterEach(() => r?.destroy());

describe.each(VARIANTS)('smoke (%s)', (variant) => {
  it('Enter/Tab state machine runs on real key presses, and edits sync to the other client', async () => {
    r = room(variant, SCENE);
    placeCursor(r.a, 4, 'end'); // end of the action "She does not believe it either."
    await keys(r.a, '{Enter}'); // Action -> Action
    await keys(r.a, '{Tab}'); // empty Action -> Character
    await typeText(r.a, 'mara');
    await keys(r.a, '{Enter}'); // Character -> Dialogue
    await typeText(r.a, 'Go home.');
    await keys(r.a, '{Tab}'); // Dialogue -> Parenthetical
    await r.net.settle();
    const types = blocksOf(r.a)
      .slice(5, 7)
      .map((b) => b.type);
    expect(types).toEqual(['character', 'parenthetical']);
    expect(blocksOf(r.a)[5]!.text).toBe('mara');
    expect(converged(r)).toBe(true);
    expect(summary(r.b)).toEqual(summary(r.a));
  });
});
