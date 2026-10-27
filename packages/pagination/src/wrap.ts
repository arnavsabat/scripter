// Line wrapping by character count (SPEC 5.8): Courier Prime is monospace, so a line is a
// number of characters, never a DOM measurement. It reproduces how Chromium wraps the script
// (`white-space: pre-wrap`, `overflow-wrap: break-word`): spaces hang at a break, and the break
// opportunities come from a table measured in the browser (breaks.ts, D-072, D-074). Browser
// tests hold the two together across a generated corpus.
import { BREAK_CHARS, BREAK_TABLE, HYPHEN_DIGIT } from './breaks';

export interface WrappedLine {
  /** The line as drawn: trailing spaces removed (they hang past the right edge). */
  text: string;
  /** Offsets into the original text: [start, end), including the hanging spaces. */
  start: number;
  end: number;
}

/** A drawn character: a code point plus any combining marks, which take no width. */
interface Unit {
  ch: string;
  start: number;
  end: number;
}

const COMBINING = /\p{M}/u;
const SPACE = ' ';
const INDEX = new Map([...BREAK_CHARS].map((c, i) => [c, i]));
const LETTER = INDEX.get('a')!;
const DIGIT = INDEX.get('1')!;
const classOf = (ch: string) => INDEX.get(ch) ?? (/\p{Nd}/u.test(ch) ? DIGIT : LETTER);

function units(text: string): Unit[] {
  const out: Unit[] = [];
  let i = 0;
  for (const ch of text) {
    const start = i;
    i += ch.length;
    const last = out[out.length - 1];
    if (last && COMBINING.test(ch)) {
      last.ch += ch;
      last.end = i;
    } else out.push({ ch, start, end: i });
  }
  return out;
}

/** May a line break between `u[j-1]` and `u[j]`? After a run of spaces always; otherwise as
 * Chromium's measured tables say (D-074). Combining marks go with the character before them. */
function breakBefore(u: Unit[], j: number): boolean {
  const at = (k: number) => (k >= 0 && k < u.length ? first(u[k]!.ch) : '');
  const prev = at(j - 1);
  const next = at(j);
  if (prev === SPACE) return next !== SPACE;
  if (next === SPACE) return false;
  const p = classOf(prev);
  const n = classOf(next);
  // A hyphen before a digit binds to it, unless the hyphen follows a letter or digit.
  if (prev === '-' && n === DIGIT) {
    const before = at(j - 2);
    return before !== '' && before !== SPACE && HYPHEN_DIGIT[classOf(before)] === '1';
  }
  return BREAK_TABLE[p]![n] === '1';
}

const first = (ch: string) => String.fromCodePoint(ch.codePointAt(0)!);

/**
 * Wraps `text` into lines of at most `width` characters. Greedy, like the browser: each line
 * takes as much as fits, breaking at the last opportunity; spaces at a break hang off the end;
 * a word longer than the line is broken at exactly `width` characters.
 */
export function wrap(text: string, width: number): WrappedLine[] {
  const u = units(text);
  if (!u.length) return [{ text: '', start: 0, end: 0 }];
  const lines: WrappedLine[] = [];
  let i = 0;
  while (i < u.length) {
    let lastBreak = -1;
    let j = i;
    let end = u.length;
    for (; j < u.length; j++) {
      if (j > i && breakBefore(u, j)) lastBreak = j;
      if (u[j]!.ch === SPACE) continue; // spaces never push a line over (they hang)
      if (j - i >= width) {
        end = lastBreak > i ? lastBreak : j;
        break;
      }
    }
    if (j === u.length) end = u.length;
    const slice = u.slice(i, end);
    const drawn = slice.map((x) => x.ch).join('');
    lines.push({ text: drawn.replace(/ +$/, ''), start: u[i]!.start, end: u[end - 1]!.end });
    i = end;
  }
  return lines;
}
