// Full-page notices in the sign-in page's layout (D-084): the API can't be reached as the app
// starts, or the app crashed. No toolbar, the wordmark, one line, one button.
import { useState } from 'react';
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

/** The API didn't answer: it keeps trying by itself (auth.ts), and Try again tries now. */
export function CantReach() {
  const [trying, setTrying] = useState(false);
  return (
    <Notice
      title="Can’t reach Scripter"
      sub="Your scripts on this device are safe. Trying again…"
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
