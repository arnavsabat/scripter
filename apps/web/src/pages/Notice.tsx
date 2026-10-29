// Full-page notices in the sign-in page's layout (D-084): the API can't be reached as the app
// starts, the app crashed, or the screen is too narrow for screenplay pages (D-107). No toolbar,
// the wordmark, one line, one button.
import { useEffect, useState } from 'react';
import { auth } from '../auth';
import './signin.css';

function Notice({
  title,
  sub,
  action,
  onAction,
}: {
  title: string;
  sub: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="si-page">
      <div className="si" role="alert">
        <div className="si-mark">SCRIPTER</div>
        <h1>{title}</h1>
        <p className="si-sub">{sub}</p>
        <button className="si-c" type="button" onClick={onAction}>
          {action}
        </button>
      </div>
    </div>
  );
}

/**
 * The API didn't answer: it keeps trying by itself (auth.ts), and Try again tries now. Offline is
 * the writer's connection; anything else is ours, and says so (D-107).
 */
export function CantReach() {
  const [trying, setTrying] = useState(false);
  const offline = navigator.onLine === false;
  return (
    <Notice
      title={offline ? 'You’re offline' : 'Scripter is down right now'}
      sub={
        offline
          ? 'Your scripts on this device are safe. Trying again when you’re back…'
          : 'That’s on us, not your connection, and we’re on it. Your scripts on this device are safe. Trying again…'
      }
      action="Try again"
      onAction={() => {
        if (trying) return;
        setTrying(true);
        void auth.retryNow().then(() => setTrying(false));
      }}
    />
  );
}

/** The app hit an error it couldn't recover from. Typed edits are in this device's copy. */
export function Crashed() {
  return (
    <Notice
      title="Something went wrong"
      sub="Your work is saved on this device. Reload to pick up where you left off."
      action="Reload"
      onAction={() => location.reload()}
    />
  );
}

/** Below this width there's no room for a screenplay page (8.5 in) beside anything (D-107). */
export const NARROW = '(max-width: 759px)';

/** True while the window is narrower than a screenplay page needs. */
export function useNarrow() {
  const [narrow, setNarrow] = useState(() => matchMedia(NARROW).matches);
  useEffect(() => {
    const query = matchMedia(NARROW);
    const onChange = () => setNarrow(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

/** Phones (the minimum, D-107): Scripter needs a bigger screen; copy the link to open it there. */
export function TooNarrow() {
  const [copied, setCopied] = useState(false);
  return (
    <Notice
      title="Scripter needs a bigger screen"
      sub="Screenplay pages need the width of a laptop or desktop. Open scripter.ca there to write."
      action={copied ? 'Link copied' : 'Copy link'}
      onAction={() => {
        void navigator.clipboard.writeText(location.origin).then(
          () => setCopied(true),
          () => {},
        );
      }}
    />
  );
}
