// PDF export (SPEC 5.7, D-076): drawn in the browser from the pagination output, so every page
// break, page number, (MORE), (CONT'D) and CONTINUED matches the screen. Courier Prime is
// embedded, the same file the screen uses. An auto title page goes first, unnumbered (D-076).
//
// layoutPdf() is pure (where each string goes); exportPdf() draws it with pdf-lib, which loads
// only when someone exports.
import { COLUMNS, LINES_PER_PAGE, wrap, type Pagination } from '@wr/pagination';

/** A string on a page: x from the left edge, y of its line's top from the top edge, in points. */
export interface DrawnText {
  text: string;
  x: number;
  y: number;
}

export interface TitlePage {
  /** The script's or the series' name. */
  title: string;
  /** An episode's name, for a series. */
  episode?: string;
  writers: string[];
}

const INCH = 72;
const LINE = 12; // 12 pt Courier Prime on 6 lines per inch
const TOP = INCH;
const RIGHT = 7.5 * INCH;
/** One character's advance: Courier Prime's 1228 units per 2048-unit em, at 12 pt. */
export const CHAR = (1228 / 2048) * 12;
/**
 * From a line's top to its baseline, as the browser places it: the 16 px line box holds the
 * font's 1600 + 700 unit ascent and descent centered, so the baseline sits half the leading
 * (negative here) plus the ascent below the top.
 */
export const BASELINE = (LINE - (2300 / 2048) * 12) / 2 + (1600 / 2048) * 12;

const at = (inches: number) => inches * INCH;
const rightAligned = (text: string, right = RIGHT) => right - text.length * CHAR;

/** The script pages, one list of strings per page. */
export function layoutPages(p: Pagination): DrawnText[][] {
  return p.pages.map((page) => {
    const out: DrawnText[] = [];
    if (page.number > 1) {
      const n = `${page.number}.`;
      out.push({ text: n, x: rightAligned(n), y: at(0.5) });
    }
    let y = TOP;
    for (const it of page.items) {
      switch (it.kind) {
        case 'continuedTop':
          out.push({ text: 'CONTINUED:', x: at(1.5), y });
          y += 2 * LINE;
          break;
        case 'contd':
          for (const line of it.lines) {
            out.push({ text: line, x: at(COLUMNS.character.left), y });
            y += LINE;
          }
          break;
        case 'text': {
          y += it.spaceBefore * LINE;
          for (const line of it.lines) {
            const x = it.type === 'transition' ? rightAligned(line) : at(COLUMNS[it.type].left);
            if (line) out.push({ text: line, x, y });
            y += LINE;
          }
          break;
        }
        case 'more':
          out.push({ text: '(MORE)', x: at(COLUMNS.character.left), y });
          break;
        case 'continued':
          out.push({
            text: '(CONTINUED)',
            x: rightAligned('(CONTINUED)'),
            y: TOP + (LINES_PER_PAGE - 1) * LINE,
          });
          break;
      }
    }
    return out;
  });
}

/**
 * The standard title page: the title in capitals a third of the way down, the episode's name
 * in quotes under it, then "Written by" and the writers, all centered between the margins.
 */
export function layoutTitlePage(t: TitlePage): DrawnText[] {
  const out: DrawnText[] = [];
  const center = (text: string, y: number) =>
    out.push({ text, x: at(4.5) - (text.length * CHAR) / 2, y });
  let y = TOP + 21 * LINE;
  for (const l of wrap(t.title.toUpperCase(), 60)) {
    center(l.text, y);
    y += LINE;
  }
  if (t.episode) {
    y += LINE;
    for (const l of wrap(`"${t.episode}"`, 60)) {
      center(l.text, y);
      y += LINE;
    }
  }
  if (t.writers.length) {
    y += 3 * LINE;
    center('Written by', y);
    y += 2 * LINE;
    // A team is joined with "&" (the WGA credit convention).
    for (const l of wrap(t.writers.join(' & '), 60)) {
      center(l.text, y);
      y += LINE;
    }
  }
  return out;
}

export interface PdfMeta {
  titlePage: TitlePage;
  fileName: string;
}

/** Draws the PDF and hands it to the browser as a download. */
export async function exportPdf(p: Pagination, meta: PdfMeta): Promise<void> {
  const [{ PDFDocument, rgb }, { default: fontkit }, fontBytes] = await Promise.all([
    import('pdf-lib'),
    import('@pdf-lib/fontkit'),
    fetch('/fonts/CourierPrime-Regular.ttf').then((r) => {
      if (!r.ok) throw new Error('font');
      return r.arrayBuffer();
    }),
  ]);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });
  const draw = (texts: DrawnText[]) => {
    const page = doc.addPage([8.5 * INCH, 11 * INCH]);
    for (const t of texts)
      page.drawText(t.text, {
        x: t.x,
        y: 11 * INCH - t.y - BASELINE,
        size: 12,
        font,
        color: rgb(0, 0, 0),
      });
  };
  draw(layoutTitlePage(meta.titlePage));
  for (const page of layoutPages(p)) draw(page);
  doc.setTitle(
    meta.titlePage.episode
      ? `${meta.titlePage.title}: ${meta.titlePage.episode}`
      : meta.titlePage.title,
  );
  if (meta.titlePage.writers.length) doc.setAuthor(meta.titlePage.writers.join(' & '));
  doc.setCreator('Writers’ Room');
  doc.setProducer('Writers’ Room');
  const bytes = await doc.save();
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = meta.fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** "The Long Night - Ep 3 - Pilot.pdf", with characters file systems dislike removed. */
export function pdfFileName(parts: string[]) {
  const name = parts
    .filter(Boolean)
    .join(' - ')
    .replace(/[\\/:*?"<>|]+/g, '')
    .trim();
  return `${name || 'Untitled script'}.pdf`;
}
