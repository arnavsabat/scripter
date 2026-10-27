// Cognito's sign-in API, called from our server with plain JSON requests (D-031). Our app client
// is public (no secret), so these calls need no AWS signing. Google goes through Cognito's
// /oauth2 endpoints with PKCE, straight to Google, so Cognito's own pages never show.
// One call is an admin call, signed with the server's AWS credentials: an account's status (D-065).
import {
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';

export interface CognitoConfig {
  clientId: string;
  /** https://cognito-idp.<region>.amazonaws.com/ (tests point it at a local fake). */
  apiUrl: string;
  /** The pool's domain, e.g. https://<prefix>.auth.<region>.amazoncognito.com (for Google). */
  oauthUrl: string;
  region: string;
  userPoolId: string;
  /** Tests only: the fake ignores signatures. Otherwise the SDK's usual chain (AWS_PROFILE, the task role). */
  credentials?: { accessKeyId: string; secretAccessKey: string };
}

export interface Tokens {
  accessToken: string;
  idToken: string;
  /** Present on first sign-in; refreshing keeps the same one. */
  refreshToken?: string;
  expiresIn: number;
}

/** A refusal from Cognito; `type` is its exception name, e.g. CodeMismatchException. */
export class CognitoError extends Error {
  constructor(
    readonly type: string,
    message: string,
  ) {
    super(message);
  }
}

interface AuthResult {
  AuthenticationResult?: {
    AccessToken: string;
    IdToken: string;
    RefreshToken?: string;
    ExpiresIn: number;
  };
  ChallengeName?: string;
  Session?: string;
}

export type CognitoClient = ReturnType<typeof cognitoClient>;

const text = (v: unknown, fallback: string) => (typeof v === 'string' && v ? v : fallback);

export function cognitoClient(cfg: CognitoConfig) {
  const ClientId = cfg.clientId;
  const admin = new CognitoIdentityProviderClient({
    region: cfg.region,
    endpoint: cfg.apiUrl,
    ...(cfg.credentials ? { credentials: cfg.credentials } : {}),
  });

  async function call<T>(operation: string, body: object): Promise<T> {
    const res = await fetch(cfg.apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-amz-json-1.1',
        'x-amz-target': `AWSCognitoIdentityProviderService.${operation}`,
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const type = text(json.__type, 'UnknownError').split('#').pop()!;
      throw new CognitoError(type, text(json.message, text(json.Message, type)));
    }
    return json as T;
  }

  const tokens = (r: AuthResult): Tokens => {
    const a = r.AuthenticationResult;
    if (!a) throw new CognitoError('UnexpectedChallenge', `Cognito asked for ${r.ChallengeName}`);
    return {
      accessToken: a.AccessToken,
      idToken: a.IdToken,
      ...(a.RefreshToken ? { refreshToken: a.RefreshToken } : {}),
      expiresIn: a.ExpiresIn,
    };
  };

  return {
    /** A new account with no password; Cognito emails a confirmation code. */
    async signUp(email: string): Promise<string | undefined> {
      const r = await call<{ Session?: string }>('SignUp', {
        ClientId,
        Username: email,
        UserAttributes: [{ Name: 'email', Value: email }],
      });
      return r.Session;
    },
    /**
     * Whether an existing address finished signing up. The public calls can't say: the pool hides
     * whether accounts exist, and re-sends sign-up codes even to confirmed accounts (D-065).
     */
    async isConfirmed(email: string): Promise<boolean> {
      try {
        const r = await admin.send(
          new AdminGetUserCommand({ UserPoolId: cfg.userPoolId, Username: email }),
        );
        return r.UserStatus !== 'UNCONFIRMED';
      } catch (err) {
        const e = err as { name?: string; message?: string };
        throw new CognitoError(e.name ?? 'UnknownError', e.message ?? 'AdminGetUser failed');
      }
    },
    async resendSignUpCode(email: string): Promise<void> {
      await call('ResendConfirmationCode', { ClientId, Username: email });
    },
    /** Confirms the account; the returned session signs it in without a second code. */
    async confirmSignUp(email: string, code: string, session?: string): Promise<string> {
      const r = await call<{ Session?: string }>('ConfirmSignUp', {
        ClientId,
        Username: email,
        ConfirmationCode: code,
        ...(session ? { Session: session } : {}),
      });
      if (!r.Session) throw new CognitoError('NoSession', 'Cognito returned no session');
      return r.Session;
    },
    async signInWithSession(email: string, session: string): Promise<Tokens> {
      return tokens(
        await call<AuthResult>('InitiateAuth', {
          ClientId,
          AuthFlow: 'USER_AUTH',
          AuthParameters: { USERNAME: email },
          Session: session,
        }),
      );
    },
    /** An existing account: Cognito emails a one-time code. */
    async startEmailCode(email: string): Promise<string> {
      const r = await call<AuthResult>('InitiateAuth', {
        ClientId,
        AuthFlow: 'USER_AUTH',
        AuthParameters: { USERNAME: email, PREFERRED_CHALLENGE: 'EMAIL_OTP' },
      });
      if (r.ChallengeName !== 'EMAIL_OTP' || !r.Session)
        throw new CognitoError('UnexpectedChallenge', `Cognito asked for ${r.ChallengeName}`);
      return r.Session;
    },
    async answerEmailCode(email: string, session: string, code: string): Promise<Tokens> {
      return tokens(
        await call<AuthResult>('RespondToAuthChallenge', {
          ClientId,
          ChallengeName: 'EMAIL_OTP',
          Session: session,
          ChallengeResponses: { USERNAME: email, EMAIL_OTP_CODE: code },
        }),
      );
    },
    async refresh(refreshToken: string): Promise<Tokens> {
      return tokens(
        await call<AuthResult>('InitiateAuth', {
          ClientId,
          AuthFlow: 'REFRESH_TOKEN_AUTH',
          AuthParameters: { REFRESH_TOKEN: refreshToken },
        }),
      );
    },
    /** Sign out: the refresh token (and the access tokens it issued) stop working. */
    async revoke(refreshToken: string): Promise<void> {
      await call('RevokeToken', { ClientId, Token: refreshToken });
    },
    googleUrl(redirectUri: string, state: string, codeChallenge: string): string {
      const q = new URLSearchParams({
        identity_provider: 'Google',
        response_type: 'code',
        client_id: ClientId,
        redirect_uri: redirectUri,
        scope: 'openid email profile',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });
      return `${cfg.oauthUrl}/oauth2/authorize?${q.toString()}`;
    },
    async exchangeCode(code: string, redirectUri: string, verifier: string): Promise<Tokens> {
      const res = await fetch(`${cfg.oauthUrl}/oauth2/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: ClientId,
          code,
          redirect_uri: redirectUri,
          code_verifier: verifier,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || typeof j.access_token !== 'string' || typeof j.id_token !== 'string')
        throw new CognitoError(text(j.error, 'TokenExchangeFailed'), 'Google sign-in failed');
      return {
        accessToken: j.access_token,
        idToken: j.id_token,
        ...(typeof j.refresh_token === 'string' ? { refreshToken: j.refresh_token } : {}),
        expiresIn: Number(j.expires_in ?? 3600),
      };
    },
  };
}
