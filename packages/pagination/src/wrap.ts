// Line wrapping by character count (SPEC 5.8): Courier Prime is monospace, so a line is a
// number of characters, never a DOM measurement. The rules reproduce how Chromium wraps the
// script (`white-space: pre-wrap`, `overflow-wrap: break-word`), as probed in D-072; a browser
// test holds the two together across a generated corpus.

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
/** Breaks are allowed after these (Chromium, D-072). */
const BREAK_AFTER = new Set(['-', '–', '—', '…', '?']);
/** ...unless the next character is one of these (quotes, closing brackets, more punctuation). */
const NO_BREAK_BEFORE = new Set([
  '"',
  "'",
  '“',
  '”',
  '‘',
  '’',
  ')',
  ']',
  '}',
  '»',
  '!',
  '?',
  '.',
  ',',
  ':',
  ';',
  '…',
]);
const DASHES = new Set(['-', '–', '—']);

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

/** May a line break between `u[j-1]` and `u[j]`? (Spaces are handled by the caller.) */
function breakBefore(u: Unit[], j: number): boolean {
  const prev = u[j - 1]!.ch;
  const next = u[j]!.ch;
  if (prev === SPACE) return next !== SPACE;
  if (next === SPACE) return false;
  // An em dash may start a line, unless it follows another dash or an opening quote.
  if (next === '—') return !DASHES.has(prev) && !NO_BREAK_BEFORE.has(prev) && prev !== '“';
  if (!BREAK_AFTER.has(prev)) return false;
  // Runs of dashes ("--", "—-") break only after the last one.
  if (DASHES.has(prev) && DASHES.has(next)) return false;
  // A hyphen may be followed by a quote ("-\"") and still break; the others may not.
  if (prev === '-' || prev === '–') return true;
  return !NO_BREAK_BEFORE.has(next);
}

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
