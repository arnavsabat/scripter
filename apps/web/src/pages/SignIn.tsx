// The sign-in page (D-028, D-029, prototype v2): Arnav's template in our tokens, with no toolbar.
// Email code or Google; a new email gets a sign-up code and, once in, the name step. From an
// invitation link it reads "Join Fogline / Sam Jones invited you to write".
import { useRef, useState, type FormEvent } from 'react';
import { ApiFailure, publicApi } from '../api';
import { auth, type Me, type SignedIn } from '../auth';
import { useToast } from '../components/Toast';
import { DEMO_CREDIT, startDemo } from '../demo/demo';
import { navigate } from '../router';
import './signin.css';

export interface InvitePreview {
  seriesName: string;
  from: string;
  role: string;
}

type Step =
  | { name: 'email' }
  | { name: 'code'; attempt: string; codeLength: number }
  | { name: 'name'; signedIn: SignedIn };

const GoogleG = () => (
  // Google's "G" keeps its brand colors (Google's sign-in branding rules).
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path
      fill="#EA4335"
      d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.2 5.6c4.2-3.9 7.1-9.6 7.1-17.1z"
    />
    <path
      fill="#FBBC05"
      d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2 1.4-4.7 2.3-8.7 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z"
    />
  </svg>
);

export function SignIn({ invite }: { invite?: InvitePreview | null }) {
  const toast = useToast();
  const [step, setStep] = useState<Step>({ name: 'email' });
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const busy = useRef(false);

  const once = async (fn: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await fn();
    } catch (err) {
      toast.show(
        err instanceof ApiFailure ? err.message : 'Something went wrong. Please try again.',
      );
    } finally {
      busy.current = false;
    }
  };

  const sendCode = (e?: FormEvent) => {
    e?.preventDefault();
    const address = email.trim();
    if (!address.includes('@')) return;
    void once(async () => {
      const r = await publicApi<{ attempt: string; codeLength: number }>(
        'POST',
        '/api/auth/email/start',
        { email: address },
      );
      setCode('');
      setStep({ name: 'code', ...r });
    });
  };

  const verify = (value: string) => {
    if (step.name !== 'code') return;
    void once(async () => {
      const s = await publicApi<SignedIn & { needsName: boolean }>(
        'POST',
        '/api/auth/email/verify',
        { attempt: step.attempt, code: value },
      );
      if (s.needsName) {
        setName('');
        setStep({ name: 'name', signedIn: s });
      } else auth.signedIn(s);
    });
  };

  const resend = () => {
    if (step.name !== 'code') return;
    void once(async () => {
      const r = await publicApi<{ attempt: string; codeLength: number }>(
        'POST',
        '/api/auth/email/resend',
        { attempt: step.attempt },
      );
      setCode('');
      setStep({ name: 'code', ...r });
      toast.show(`We sent a new code to ${email.trim()}`);
    });
  };

  const tryDemo = () =>
    void once(async () => {
      await startDemo();
      toast.show(DEMO_CREDIT);
    });

  const saveName = (e: FormEvent) => {
    e.preventDefault();
    if (step.name !== 'name' || !name.trim()) return;
    const pending = step.signedIn;
    void once(async () => {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${pending.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new ApiFailure(res.status, 'error', 'Couldn’t save your name.');
      auth.signedIn({ ...pending, user: (await res.json()) as Me });
    });
  };

  return (
    <div className="si-page">
      <div className="si">
        <div className="si-mark">SCRIPTER</div>

        {step.name === 'email' && (
          <form onSubmit={sendCode} noValidate>
            {invite ? (
              <>
                <h1>Join {invite.seriesName}</h1>
                <p className="si-sub">
                  {invite.from} invited you to {invite.role === 'viewer' ? 'read' : 'write'}. Sign
                  in or create an account to join.
                </p>
              </>
            ) : (
              <>
                <h1>Sign in or create an account</h1>
                <p className="si-sub">Write together in real time. No password needed.</p>
              </>
            )}
            <a className="si-g" href="/api/auth/google/start">
              <GoogleG /> Continue with Google
            </a>
            <div className="si-or">or</div>
            <input
              className="si-f"
              type="email"
              placeholder="Enter email address"
              aria-label="Email address"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="si-c" type="submit">
              Continue
            </button>
            <p className="si-legal">
              By continuing, you agree to the Scripter{' '}
              <button type="button" onClick={() => navigate('/terms')}>
                Terms of Service
              </button>{' '}
              and{' '}
              <button type="button" onClick={() => navigate('/privacy')}>
                Privacy Policy
              </button>
              .
            </p>
            {!invite && (
              // D-108: one click into a real script, no account. Not offered from an invitation.
              <p className="si-legal si-demo">
                Just looking?{' '}
                <button type="button" onClick={tryDemo}>
                  Try a demo script
                </button>
              </p>
            )}
          </form>
        )}

        {step.name === 'code' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (code.length >= 6) verify(code); // whatever its length, Continue sends it
            }}
          >
            <h1>Check your email</h1>
            <p className="si-sub">We sent a code to {email.trim()}.</p>
            <input
              className="si-f code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              placeholder="Enter the code"
              aria-label="Code"
              autoFocus
              value={code}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
                setCode(digits);
                if (digits.length === step.codeLength) verify(digits); // in as soon as the last digit lands
              }}
            />
            <button className="si-c" type="submit">
              Continue
            </button>
            <p className="si-alt">
              <button
                type="button"
                className="ta"
                data-t="Use a different email"
                onClick={() => setStep({ name: 'email' })}
              >
                Use a different email
              </button>{' '}
              ·{' '}
              <button type="button" className="ta" data-t="Send a new code" onClick={resend}>
                Send a new code
              </button>
            </p>
          </form>
        )}

        {step.name === 'name' && (
          <form onSubmit={saveName}>
            <h1>What should the room call you?</h1>
            <p className="si-sub">Your name shows on your cursor and in episode lists.</p>
            <input
              className="si-f"
              placeholder="Your name"
              aria-label="Your name"
              autoComplete="name"
              autoFocus
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button className="si-c" type="submit">
              Continue
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
