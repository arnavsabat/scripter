// Chromium's line-break opportunities between pairs of characters, measured in the browser and
// compared with the table the pagination package wraps by (packages/pagination/src/breaks.ts,
// D-074). If Chromium changes, this fails and prints the measured table to paste in.
import { BREAK_CHARS, BREAK_TABLE, HYPHEN_DIGIT } from '@wr/pagination/breaks';
import { expect, it } from 'vitest';
import '@wr/shared/tokens.css';
import '../src/script.css';

const CHARS = [...BREAK_CHARS];

/** Where the first line ends for `text` in a `width`-character line, with no forced breaks. */
function firstLineEnd(host: HTMLElement, text: string, width = 9) {
  const p = document.createElement('p');
  p.className = 'el';
  p.style.width = `${width * 9.6 + 0.5}px`;
  p.style.overflowWrap = 'normal';
  p.textContent = text;
  host.append(p);
  const node = p.firstChild!;
  let top: number | null = null;
  let end = text.length;
  for (let i = 0; i < text.length; i++) {
    const r = document.createRange();
    r.setStart(node, i);
    r.setEnd(node, i + 1);
    const rect = [...r.getClientRects()].at(-1);
    if (!rect) continue;
    if (top !== null && rect.top > top + 4) {
      end = i;
      break;
    }
    top ??= rect.top;
  }
  p.remove();
  return end;
}

it('the measured break table matches the one pagination uses', async () => {
  await document.fonts.load('16px "Courier Prime"');
  const host = document.createElement('div');
  host.className = 'ProseMirror script';
  document.body.append(host);
  const direct: string[] = [];
  const spaced: string[] = [];
  for (const a of CHARS) {
    let row = '';
    let srow = '';
    for (const b of CHARS) {
      // a sits in the last column; a break between a and b leaves exactly 9 on line one.
      const end = firstLineEnd(host, `xxxxxxxx${a}${b}yyyyyyyy zz`);
      row += end === 9 ? '1' : '0';
      // a, a space, then b: may the line break after the space (before b)?
      const s = firstLineEnd(host, `xxxxxxx${a} ${b}yyyyyyyy zz`);
      srow += s === 9 ? '1' : '0';
    }
    direct.push(row);
    spaced.push(srow);
  }
  // After a space, a line may always break (wrap.ts assumes it).
  expect(spaced.every((r) => !r.includes('0'))).toBe(true);
  if (JSON.stringify(direct) !== JSON.stringify(BREAK_TABLE))
    console.log(`Measured table:\n${JSON.stringify(direct, null, 2)}`);
  expect(direct).toEqual(BREAK_TABLE);

  // The hyphen-before-digit rule: "Y-1".
  const pre = CHARS.map((y) =>
    firstLineEnd(host, `xxxxxxx${y}-1yyyyyyyy zz`) === 9 ? '1' : '0',
  ).join('');
  host.remove();
  if (pre !== HYPHEN_DIGIT) console.log(`Measured HYPHEN_DIGIT: ${JSON.stringify(pre)}`);
  expect(pre).toBe(HYPHEN_DIGIT);
}, 120_000);
