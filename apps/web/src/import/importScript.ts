// Import from Final Draft (.fdx) and Fountain (SPEC 5.7) into our seven block types. What we
// can't represent is handled as D-071 decided: script text is kept as Action (centered text,
// lyrics, act breaks, "General" paragraphs); metadata isn't imported (notes, synopses, sections,
// boneyard, revision marks, scene numbers, forced page breaks); bold, italic and underline are
// dropped; dual dialogue becomes one speech after the other; the title page's title names the
// script. The report says all of it plainly in the import toast.
import type { ElementType } from '@wr/schema';

export interface ImportedBlock {
  type: ElementType;
  text: string;
}

export interface ImportResult {
  title: string;
  blocks: ImportedBlock[];
  report: ImportReport;
}

export class ImportError extends Error {}

// ---- The report ----

const NOUNS = {
  note: ['note', 'notes'],
  section: ['section', 'sections'],
  synopsis: ['synopsis', 'synopses'],
  boneyard: ['boneyard passage', 'boneyard passages'],
  pageBreak: ['forced page break', 'forced page breaks'],
  sceneNumber: ['scene number', 'scene numbers'],
  revision: ['revision mark', 'revision marks'],
  titleDetail: ['other title page entry', 'other title page entries'],
  centered: ['centered line', 'centered lines'],
  lyrics: ['lyric', 'lyrics'],
  general: ['general paragraph', 'general paragraphs'],
  castList: ['cast list paragraph', 'cast list paragraphs'],
  act: ['act break', 'act breaks'],
  other: ['paragraph of an unsupported type', 'paragraphs of unsupported types'],
} as const;
type Noun = keyof typeof NOUNS;

export class ImportReport {
  readonly kept = new Map<Noun, number>();
  readonly dropped = new Map<Noun, number>();
  formatting = false;
  dual = 0;
  joinedLines = 0;

  keep(what: Noun) {
    this.kept.set(what, (this.kept.get(what) ?? 0) + 1);
  }
  drop(what: Noun) {
    this.dropped.set(what, (this.dropped.get(what) ?? 0) + 1);
  }

  /** "Imported “Night Shift” · 112 pages. Kept as action: 2 centered lines. Not imported: …" */
  message(title: string, pages: number): string {
    const list = (m: Map<Noun, number>) =>
      [...m].map(([k, n]) => `${n} ${NOUNS[k][n === 1 ? 0 : 1]}`).join(', ');
    const parts = [`Imported “${title}” · ${pages} ${pages === 1 ? 'page' : 'pages'}.`];
    if (this.kept.size) parts.push(`Kept as action: ${list(this.kept)}.`);
    if (this.dropped.size) parts.push(`Not imported: ${list(this.dropped)}.`);
    if (this.dual)
      parts.push(
        `${this.dual} dual-dialogue ${this.dual === 1 ? 'pair now runs' : 'pairs now run'} one speech after the other.`,
      );
    if (this.joinedLines)
      parts.push(
        `Line breaks inside ${this.joinedLines} ${this.joinedLines === 1 ? 'paragraph' : 'paragraphs'} became spaces.`,
      );
    if (this.formatting) parts.push('Bold, italic and underline were removed.');
    return parts.join(' ');
  }
}

/** One line of text: inner line breaks and tabs become spaces, runs of spaces stay. */
function oneLine(text: string, report: ImportReport) {
  const t = text.replace(/\t/g, ' ');
  if (/\S\s*\n\s*\S/.test(t)) report.joinedLines++;
  return t.replace(/\s*\n\s*/g, ' ').trim();
}

// ---- Final Draft ----

const FDX_TYPES: Record<string, ElementType> = {
  'Scene Heading': 'scene_heading',
  Action: 'action',
  Character: 'character',
  Parenthetical: 'parenthetical',
  Dialogue: 'dialogue',
  Transition: 'transition',
  Shot: 'shot',
};
const FDX_AS_ACTION: Record<string, Noun> = {
  General: 'general',
  'Cast List': 'castList',
  'New Act': 'act',
  'End of Act': 'act',
  Lyrics: 'lyrics',
};

const children = (el: Element, name: string) => [...el.children].filter((c) => c.nodeName === name);

export function parseFdx(xml: string, fileTitle: string): ImportResult {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror') || doc.documentElement.nodeName !== 'FinalDraft')
    throw new ImportError('That file isn’t a Final Draft (.fdx) script.');
  const report = new ImportReport();
  const blocks: ImportedBlock[] = [];

  const textOf = (p: Element) => {
    const runs = children(p, 'Text');
    if (runs.some((r) => /Bold|Italic|Underline/.test(r.getAttribute('Style') ?? '')))
      report.formatting = true;
    if (runs.some((r) => r.hasAttribute('RevisionID'))) report.drop('revision');
    return oneLine(runs.map((r) => r.textContent ?? '').join(''), report);
  };

  const paragraph = (p: Element) => {
    for (let n = children(p, 'ScriptNote').length; n > 0; n--) report.drop('note');
    const dual = children(p, 'DualDialogue')[0];
    if (dual) {
      report.dual++;
      for (const inner of children(dual, 'Paragraph')) paragraph(inner);
      return;
    }
    const kind = p.getAttribute('Type') ?? 'Action';
    const text = textOf(p);
    if (!text) return;
    if (kind === 'Scene Heading' && p.getAttribute('Number')) report.drop('sceneNumber');
    const type = FDX_TYPES[kind];
    if (type) return void blocks.push({ type, text });
    report.keep(FDX_AS_ACTION[kind] ?? 'other');
    blocks.push({ type: 'action', text });
  };

  const content = [...doc.documentElement.children].find((c) => c.nodeName === 'Content');
  for (const p of content ? children(content, 'Paragraph') : []) paragraph(p);

  // The title page: its first line names the script; the rest isn't imported.
  let title = '';
  const tp = [...doc.documentElement.children].find((c) => c.nodeName === 'TitlePage');
  const tpContent = tp && [...tp.children].find((c) => c.nodeName === 'Content');
  for (const p of tpContent ? children(tpContent, 'Paragraph') : []) {
    const t = oneLine(
      children(p, 'Text')
        .map((r) => r.textContent ?? '')
        .join(''),
      new ImportReport(),
    );
    if (!t) continue;
    if (!title) title = t;
    else report.drop('titleDetail');
  }
  return { title: title || fileTitle, blocks, report };
}

// ---- Fountain (fountain.io syntax) ----

const HEADING = /^(INT|EXT|EST|INT\.?\/EXT|I\/E)[. ]/i;
const SCENE_NUMBER = /\s*#[\w.-]+#\s*$/;

/** *italic*, **bold**, ***both***, _underline_ and \-escapes, with the markers removed. */
function plain(text: string, report: ImportReport) {
  // Escaped markers (\* \_ \\) are set aside first, so they can't open or close emphasis.
  const kept: string[] = [];
  let out = text.replace(/\\([*_\\])/g, (_m, ch: string) => `\uE000${kept.push(ch) - 1}\uE000`);
  // Repeated, so nested markers (_**Title**_) all go.
  for (let prev = ''; prev !== out;) {
    prev = out;
    out = out.replace(/(\*{1,3}|_)(?=\S)(.+?)(?<=\S)\1/g, (_m, _mark, inner: string) => {
      report.formatting = true;
      return inner;
    });
  }
  return out.replace(/\uE000(\d+)\uE000/g, (_m, k: string) => kept[Number(k)]!);
}

/** A character cue: capitals (extensions in parentheses may be any case), with a letter in it. */
function isCue(line: string) {
  const name = line
    .replace(/\^$/, '')
    .replace(/\([^)]*\)/g, '')
    .trim();
  return /[A-Z]/.test(name) && name === name.toUpperCase();
}

export function parseFountain(source: string, fileTitle: string): ImportResult {
  const report = new ImportReport();
  let text = source.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  text = text.replace(/\/\*[\s\S]*?\*\//g, () => (report.drop('boneyard'), ''));
  text = text.replace(/\[\[[\s\S]*?\]\]/g, () => (report.drop('note'), ''));
  const lines = text.split('\n');
  let i = 0;

  // Title page: "Key: value" lines (values may continue on indented lines) up to a blank line.
  let title = '';
  if (/^\s*[A-Za-z][\w ]*:/.test(lines[0] ?? '')) {
    let key = '';
    for (; i < lines.length && lines[i]!.trim() !== ''; i++) {
      const line = lines[i]!;
      const m = /^\s*([A-Za-z][\w ]*):\s*(.*)$/.exec(line);
      if (m && !/^\s{2,}|\t/.test(line)) {
        key = m[1]!.toLowerCase();
        if (key === 'title' && m[2]) title = plain(m[2], new ImportReport()).trim();
        else if (key !== 'title') report.drop('titleDetail');
      } else if (key === 'title' && !title) title = plain(line.trim(), new ImportReport());
    }
  }

  const blocks: ImportedBlock[] = [];
  const blank = (k: number) => k < 0 || k >= lines.length || lines[k]!.trim() === '';
  const push = (type: ElementType, raw: string) => {
    const t = plain(raw, report).trim();
    if (t) blocks.push({ type, text: t });
  };

  while (i < lines.length) {
    const line = lines[i]!;
    const t = line.trim();
    if (!t) {
      i++;
      continue;
    }
    const before = blank(i - 1);
    const after = blank(i + 1);

    if (/^={3,}$/.test(t)) report.drop('pageBreak');
    else if (t.startsWith('#')) report.drop('section');
    else if (/^=(?!=)/.test(t)) report.drop('synopsis');
    // A heading needs a blank line before it; many files run straight into the action after.
    else if (/^\.(?!\.)/.test(t) || (before && HEADING.test(t))) {
      const heading = t.replace(/^\./, '');
      if (SCENE_NUMBER.test(heading)) report.drop('sceneNumber');
      push('scene_heading', heading.replace(SCENE_NUMBER, ''));
    } else if (/^>.*<$/.test(t)) {
      report.keep('centered');
      push('action', t.slice(1, -1));
    } else if (t.startsWith('>') || (before && after && /TO:$/.test(t) && t === t.toUpperCase()))
      push('transition', t.replace(/^>\s*/, ''));
    else if (t.startsWith('~')) {
      report.keep('lyrics');
      push('action', t.slice(1));
    } else if (before && !after && (t.startsWith('@') || (!t.startsWith('!') && isCue(t)))) {
      // A cue, then its parentheticals and dialogue up to the next blank line.
      let cue = t.replace(/^@/, '');
      if (/\^\s*$/.test(cue)) {
        report.dual++;
        cue = cue.replace(/\s*\^\s*$/, '');
      }
      push('character', cue);
      let speech: string[] = [];
      const flush = () => {
        if (speech.length > 1) report.joinedLines++;
        if (speech.length) push('dialogue', speech.join(' '));
        speech = [];
      };
      for (i++; i < lines.length && lines[i]!.trim() !== ''; i++) {
        const d = lines[i]!.trim();
        if (/^\(.*\)$/.test(d)) {
          flush();
          push('parenthetical', d);
        } else speech.push(d);
      }
      flush();
      continue;
    } else {
      // Action: everything else, up to the next blank line ("!" forces it).
      const para: string[] = [];
      for (; i < lines.length && lines[i]!.trim() !== ''; i++) para.push(lines[i]!.trim());
      if (para.length > 1) report.joinedLines++;
      push('action', para.join(' ').replace(/^!/, ''));
      continue;
    }
    i++;
  }
  return { title: title || fileTitle, blocks, report };
}

/** Reads a file by its kind: Final Draft XML, or Fountain (plain text). */
export function parseScript(fileName: string, text: string): ImportResult {
  const fileTitle = fileName.replace(/\.[^.]+$/, '').trim() || 'Imported script';
  const result =
    /\.fdx$/i.test(fileName) || /^\s*<\?xml[\s\S]{0,400}<FinalDraft/.test(text)
      ? parseFdx(text, fileTitle)
      : parseFountain(text, fileTitle);
  if (!result.blocks.length) throw new ImportError('That file has no script in it.');
  return { ...result, title: result.title.slice(0, 120) };
}
