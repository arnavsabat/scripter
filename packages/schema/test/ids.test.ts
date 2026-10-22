import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { enter, setElementType } from '../src/commands';
import { idPlugin, newId, repairIds } from '../src/ids';
import { schema } from '../src/schema';
import { cursor, doc, ids, run, state } from './helpers';

describe('block and scene IDs (SPEC 4.6)', () => {
  it('newId gives distinct, prefixed IDs', () => {
    const many = new Set(Array.from({ length: 5000 }, () => newId()));
    expect(many.size).toBe(5000);
    expect(newId('s')).toMatch(/^s[0-9a-z]{10}$/);
  });

  it('a split keeps the ID on the first half and gives the second half a new one', () => {
    const s = cursor(
      state([{ type: 'action', text: 'Rain hammers the window.', id: 'orig' }]),
      0,
      5,
    );
    const after = run(s, enter).state;
    expect(ids(after)[0]).toBe('orig');
    expect(ids(after)[1]).not.toBe('orig');
  });

  it('pasting copies of existing blocks gets them unique IDs in the same transaction', () => {
    const s = state([
      { type: 'scene_heading', text: 'INT. KITCHEN - NIGHT', id: 'h1', sceneId: 's1' },
      { type: 'action', text: 'Rain.', id: 'a1' },
    ]);
    // Paste a copy of the whole scene after itself: same block IDs and the same scene ID.
    const copy = s.doc.content;
    const after = s.applyTransaction(s.tr.insert(s.doc.content.size, copy)).state;
    expect(ids(after)).toEqual(['h1', 'a1', 'h1-2', 'a1-2']);
    const sceneIds: unknown[] = [];
    after.doc.forEach((n) => sceneIds.push(n.attrs.sceneId));
    expect(sceneIds).toEqual(['s1', null, 's1-2', null]);
  });

  it('repairs are deterministic: two clients repairing the same merged document agree', () => {
    const merged = doc([
      { type: 'action', text: 'One', id: 'x' },
      { type: 'action', text: 'Two', id: 'x' },
      { type: 'action', text: 'Three', id: 'x' },
      { type: 'action', text: 'Four', id: 'x-2' },
    ]);
    const a = EditorState.create({ schema, doc: merged });
    const b = EditorState.create({ schema, doc: merged });
    const fixedA = a.apply(repairIds(a)!);
    const fixedB = b.apply(repairIds(b)!);
    expect(ids(fixedA)).toEqual(['x', 'x-3', 'x-4', 'x-2']);
    expect(fixedA.doc.eq(fixedB.doc)).toBe(true);
  });

  it('fills in missing IDs, and only scene headings keep a scene ID', () => {
    const raw = schema.nodes.doc.create(null, [
      schema.nodes.block.create({ type: 'scene_heading', id: null, sceneId: null }),
      schema.nodes.block.create({ type: 'action', id: null, sceneId: 'stray' }),
    ]);
    const s = EditorState.create({ schema, doc: raw });
    const fixed = s.apply(repairIds(s)!);
    const attrs: unknown[] = [];
    fixed.doc.forEach((n) => attrs.push([typeof n.attrs.id, n.attrs.sceneId === null]));
    expect(attrs).toEqual([
      ['string', false],
      ['string', true],
    ]);
    expect(repairIds(fixed)).toBeNull(); // nothing left to repair
  });

  it('leaves remote changes alone in appendTransaction (spike finding F2)', () => {
    const plugin = idPlugin({ isRemote: (tr) => tr.getMeta('remote') === true });
    const s = EditorState.create({
      schema,
      doc: doc([{ type: 'action', text: 'One', id: 'dup' }]),
      plugins: [plugin],
    });
    const dup = s.tr.insert(s.doc.content.size, s.doc.content).setMeta('remote', true);
    const { state: after } = s.applyTransaction(dup);
    expect(ids(after)).toEqual(['dup', 'dup']); // repaired later, in its own transaction
  });

  it('a scene heading made by the element menu gets a fresh scene ID', () => {
    const s = cursor(
      state([
        { type: 'scene_heading', text: 'A', sceneId: 'same' },
        { type: 'action', text: 'B' },
      ]),
      1,
    );
    const after = run(s, setElementType('scene_heading')).state;
    const sceneIds: unknown[] = [];
    after.doc.forEach((n) => sceneIds.push(n.attrs.sceneId));
    expect(new Set(sceneIds).size).toBe(2);
  });
});
