// Terms of Service and Privacy Policy (D-029, D-039): short, plain-language pages Arnav reviews
// before the beta. Reachable signed in or out.
import { navigate } from '../router';
import './signin.css';

const UPDATED = 'October 27, 2026';
const CONTACT = 'sabat.arnav@gmail.com';

function Back() {
  return (
    <p className="back">
      <button
        type="button"
        className="ta"
        data-t="← Back"
        onClick={() => (history.length > 1 ? history.back() : navigate('/'))}
      >
        ← Back
      </button>
    </p>
  );
}

function Page({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="si-page">
      <div className="lg">
        <div className="top">
          <span className="si-mark">SCRIPTER</span>
        </div>
        <h1>{title}</h1>
        <p className="upd">Last updated {UPDATED}</p>
        {children}
        <Back />
      </div>
    </div>
  );
}

export function Privacy() {
  return (
    <Page title="Privacy Policy">
      <h2>What we store</h2>
      <ul>
        <li>
          Your email address and name, so you can sign in and your room can see who’s writing.
        </li>
        <li>The scripts you and your room write, so they’re there when you come back.</li>
        <li>
          Counts of things that happen, like “a PDF was exported”, with who did it, in which script
          and when. Never what you wrote.
        </li>
        <li>
          Reports of errors in the app (what went wrong and where in our code), so we can fix them.
          They never include your writing.
        </li>
      </ul>
      <h2>On your device</h2>
      <p>
        Your browser keeps a copy of the scripts you open, so you can keep writing offline; it syncs
        when you’re back. Signing out removes those copies. One cookie keeps you signed in; we don’t
        use advertising or tracking cookies.
      </p>
      <h2>Who can see your scripts</h2>
      <p>
        Only people in that series: the showrunner, and the writers and viewers they invite. We
        don’t sell your data or share it with advertisers, and we don’t use your scripts to train
        AI.
      </p>
      <h2>Where it lives</h2>
      <p>
        On Amazon Web Services in the United States (Ohio). Sign-in codes and invitations are sent
        by email through Amazon. If you sign in with Google, Google tells us your name and email
        address, nothing else.
      </p>
      <h2>Deleting</h2>
      <p>
        A script or series you delete waits 30 days under Recently deleted, in case it was a
        mistake, and is then erased for good. Backups are kept for up to 7 days.
      </p>
      <p>
        To delete your account, email {CONTACT} and we’ll delete it and your email address within 30
        days. Series you share with others stay with them.
      </p>
      <h2>Changes</h2>
      <p>If this policy changes, we’ll email you before it takes effect.</p>
    </Page>
  );
}

export function Terms() {
  return (
    <Page title="Terms of Service">
      <h2>Your writing is yours</h2>
      <p>
        You own what you write. You let us store and show it to the people you share it with, only
        so the app works.
      </p>
      <h2>Using Scripter</h2>
      <p>
        Use it to write. Don’t use it to break the law, harass people, or attack or overload the
        service.
      </p>
      <h2>It’s a beta</h2>
      <p>
        Scripter is free while it’s in beta, and things may break. We work hard not to lose
        anything, but keep your own copies of anything important (PDF export).
      </p>
      <h2>Accounts</h2>
      <p>
        We may suspend an account that abuses the service. You can stop using it at any time, and
        ask us to delete your account (see the Privacy Policy).
      </p>
      <h2>Changes</h2>
      <p>If these terms change, we’ll email you before they take effect.</p>
    </Page>
  );
}
