import { SignJWT, generateKeyPair } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { idTokenVerifier, tokenVerifier, type TokenVerifier } from '../src/index';
import { createTestIssuer, type TestIssuer } from '../src/testing';

let issuer: TestIssuer;
let verify: TokenVerifier;
beforeAll(async () => {
  issuer = await createTestIssuer();
  verify = tokenVerifier([issuer.trusted]);
});

describe('token check', () => {
  it('accepts a valid access token and returns its subject', async () => {
    expect(await verify(await issuer.sign('user-1'))).toEqual({
      sub: 'user-1',
      issuer: issuer.trusted.issuer,
    });
  });

  it('refuses an ID token, even one signed by the right key', async () => {
    expect(await verify(await issuer.sign('user-1', { tokenUse: 'id' }))).toBeNull();
  });

  it('refuses a token issued to another app client', async () => {
    expect(await verify(await issuer.sign('user-1', { clientId: 'someone-else' }))).toBeNull();
  });

  it('refuses an expired token', async () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    expect(await verify(await issuer.sign('user-1', { expiresIn: past }))).toBeNull();
  });

  it("refuses a token claiming our issuer but signed with someone else's key", async () => {
    const { privateKey } = await generateKeyPair('RS256');
    const forged = await new SignJWT({ token_use: 'access', client_id: 'test-client' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(issuer.trusted.issuer)
      .setSubject('user-1')
      .setExpirationTime('1h')
      .sign(privateKey);
    expect(await verify(forged)).toBeNull();
  });

  it('refuses tokens from an issuer it was not given', async () => {
    const other = await createTestIssuer();
    const onlyOther = tokenVerifier([other.trusted]);
    // Both test issuers share an issuer URL, so this also proves the key, not the name, decides.
    expect(await onlyOther(await issuer.sign('user-1'))).toBeNull();
    expect(await tokenVerifier([])(await issuer.sign('user-1'))).toBeNull();
  });

  it('refuses garbage and the old unsigned development tokens', async () => {
    expect(await verify('not-a-token')).toBeNull();
    expect(await verify('DEV-UNSIGNED.eyJ1c2VySWQiOiJ4In0')).toBeNull();
    expect(await verify('')).toBeNull();
  });
});

describe('ID token check (sign-in only)', () => {
  it('reads the email, whether it is verified, the name, and the provider', async () => {
    const readId = idTokenVerifier(issuer.trusted);
    expect(
      await readId(
        await issuer.signId('g-1', {
          email: 'maya@example.com',
          name: 'Maya Alvarez',
          google: true,
        }),
      ),
    ).toEqual({
      sub: 'g-1',
      email: 'maya@example.com',
      emailVerified: true,
      name: 'Maya Alvarez',
      provider: 'google',
    });
    expect(
      await readId(await issuer.signId('e-1', { email: 'sam@example.com', emailVerified: false })),
    ).toEqual({
      sub: 'e-1',
      email: 'sam@example.com',
      emailVerified: false,
      name: null,
      provider: 'email',
    });
  });
  it('an access token is not an ID token, and vice versa', async () => {
    expect(await idTokenVerifier(issuer.trusted)(await issuer.sign('u'))).toBeNull();
    expect(await verify(await issuer.signId('u', { email: 'a@example.com' }))).toBeNull();
  });
});
