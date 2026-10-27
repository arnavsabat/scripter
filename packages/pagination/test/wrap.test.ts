import { describe, expect, it } from 'vitest';
import { wrap } from '../src/wrap';

const texts = (t: string, w: number) => wrap(t, w).map((l) => l.text);

describe('wrap: Chromium pre-wrap rules (D-072)', () => {
  it('an empty block is one line', () => {
    expect(wrap('', 10)).toEqual([{ text: '', start: 0, end: 0 }]);
  });

  it('a line holds exactly `width` characters; one more wraps at the last space', () => {
    expect(texts('aaaaaaaaaa', 10)).toEqual(['aaaaaaaaaa']);
    expect(texts('aaaa bbbbbb', 10)).toEqual(['aaaa', 'bbbbbb']);
    expect(texts('aaaaaaaaa bbbbbbb', 10)).toEqual(['aaaaaaaaa', 'bbbbbbb']);
  });

  it('spaces at a break hang past the edge and are not drawn', () => {
    expect(texts('aaaaaaaaaa   bbbb', 10)).toEqual(['aaaaaaaaaa', 'bbbb']);
    expect(wrap('aaaaaaaaaa   bbbb', 10)[1]!.start).toBe(13);
  });

  it('leading and inner spaces take room', () => {
    expect(texts('   aaaaaaa bbb', 10)).toEqual(['   aaaaaaa', 'bbb']);
    expect(texts('aaaa  bbbb cc', 10)).toEqual(['aaaa  bbbb', 'cc']);
  });

  it('breaks after hyphens, en and em dashes, ellipses and question marks', () => {
    expect(texts('aaaaaaa-bbbbbbbbb', 10)).toEqual(['aaaaaaa-', 'bbbbbbbbb']);
    expect(texts('aaaaaaa--bbbbbbbb', 10)).toEqual(['aaaaaaa--', 'bbbbbbbb']);
    expect(texts('aaaaaaa–bbbbbbbbb', 10)).toEqual(['aaaaaaa–', 'bbbbbbbbb']);
    expect(texts('aaaaaaa—bbbbbbbbb', 10)).toEqual(['aaaaaaa—', 'bbbbbbbbb']);
    expect(texts('aaaaaaa…bbbbbbbbb', 10)).toEqual(['aaaaaaa…', 'bbbbbbbbb']);
    expect(texts('aaaaaaa?bbbbbbbbb', 10)).toEqual(['aaaaaaa?', 'bbbbbbbbb']);
    expect(texts('aaaa 12-34567890', 10)).toEqual(['aaaa 12-', '34567890']);
  });

  it('may break before an em dash, but not before other marks', () => {
    expect(texts('aaaaa bbbb—cc', 10)).toEqual(['aaaaa bbbb', '—cc']);
    expect(texts('aaaaa bbbb–cc', 10)).toEqual(['aaaaa', 'bbbb–cc']);
    expect(texts('aaaaa bbbb?cc', 10)).toEqual(['aaaaa', 'bbbb?cc']);
  });

  it('never breaks at slashes, periods, commas, brackets, quotes or "!"', () => {
    for (const ch of ['/', '.', ',', '(', ')', '"', '’', '!', ':', ';'])
      expect(texts(`aaaaaaa${ch}bbbbbbbbb`, 10), ch).toEqual([`aaaaaaa${ch}bb`, 'bbbbbbb']);
  });

  it('quotes and closing brackets keep a mark on the line before them', () => {
    expect(texts('aaaaaaa?"bbbbbbbb', 10)).toEqual(['aaaaaaa?"b', 'bbbbbbb']);
    expect(texts('aaaaaaa…"bbbbbbbb', 10)).toEqual(['aaaaaaa…"b', 'bbbbbbb']);
    expect(texts('aaaaaaa-"bbbbbbbb', 10)).toEqual(['aaaaaaa-', '"bbbbbbbb']);
    expect(texts('aaaaaa—"bbbbbbbbb', 10)).toEqual(['aaaaaa', '—"bbbbbbbb', 'b']);
    expect(texts('aaaaaa"—bbbbbbbbb', 10)).toEqual(['aaaaaa"—', 'bbbbbbbbb']);
  });

  it('a word longer than the line breaks at exactly the width', () => {
    expect(texts('a'.repeat(24), 10)).toEqual(['a'.repeat(10), 'a'.repeat(10), 'aaaa']);
    expect(texts(`a ${'a'.repeat(22)}`, 10)).toEqual(['a', 'a'.repeat(10), 'a'.repeat(10), 'aa']);
  });

  it('combining accents take no room; no-break spaces don’t break', () => {
    expect(texts('éaaaaaaaa bbbb', 10)).toEqual(['éaaaaaaaa', 'bbbb']);
    expect(texts('aaaa bbbbbbbbbbb', 10)).toEqual(['aaaa bbbbb', 'bbbbbb']);
  });

  it('offsets point back into the original text', () => {
    const t = 'one two three four five six';
    for (const l of wrap(t, 9)) expect(t.slice(l.start, l.end).trimEnd()).toBe(l.text);
  });
});
