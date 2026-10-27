// Loading skeletons (D-084): what's coming, drawn as bars in its real geometry, so the page
// doesn't jump when it arrives. Script lines use the screenplay's own element classes, so a
// heading's bar starts at 1.5 in and dialogue's at 2.5 in, exactly where the words will be.
import type { ElementType } from '@wr/schema';
import './skeleton.css';

const bar = (width: string, title = false) => (
  <span className={`sk${title ? ' title' : ''}`} style={{ width }} />
);

/** Sidebar rows (scenes, or Home's scripts and series). */
export function RowsSkeleton({ widths = ['62%', '48%', '70%', '55%', '40%', '66%'] }) {
  return (
    <div className="list sk-wrap sk-rows" aria-hidden="true">
      {widths.map((w, i) => (
        <div key={i} className="row">
          {bar(w)}
        </div>
      ))}
    </div>
  );
}

/** Home's centre: a series title and its episode rows. */
export function EpisodesSkeleton() {
  return (
    <div className="sk-wrap" aria-hidden="true">
      <div className="sh">
        <span style={{ width: '100%' }}>
          {bar('34%', true)}
          {bar('22%')}
        </span>
      </div>
      <div className="eps">
        {['38%', '52%', '30%', '46%'].map((w, i) => (
          <div key={i} className="ep" style={{ cursor: 'default' }}>
            {bar(w)}
          </div>
        ))}
      </div>
    </div>
  );
}

// Two scenes' worth of lines, widths in characters (Courier Prime: 1ch is one character).
const LINES: [ElementType, ...number[]][] = [
  ['scene_heading', 24],
  ['action', 60, 60, 31],
  ['character', 6],
  ['dialogue', 34, 18],
  ['action', 52],
  ['character', 9],
  ['parenthetical', 12],
  ['dialogue', 30],
  ['scene_heading', 28],
  ['action', 60, 44],
  ['character', 7],
  ['dialogue', 35, 35, 12],
];

/** A script's first lines, inside the page, at the margins the real lines will have. */
export function ScriptSkeleton() {
  return (
    <div className="script sk-script sk-wrap" aria-hidden="true">
      {LINES.map(([type, ...widths], i) => (
        <p key={i} className="el" data-type={type}>
          {widths.map((w, j) => (
            <span key={j} className="sk" style={{ width: `${w}ch` }} />
          ))}
        </p>
      ))}
    </div>
  );
}
