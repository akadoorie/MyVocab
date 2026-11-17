import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { makeSignature } from 'better-auth/crypto';
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { createAuth } from '../src/auth/auth';
import { loadConfig } from '../src/config';
import { createDb } from '../src/db/client';
import { api, authed, BASE, signIn } from './helpers';

describe('admin RBAC in development/test (lock 1)', () => {
  it('401 for guests, 403 for learners, 200 for admins', async () => {
    expect((await api('/admin/stats')).status).toBe(401);
    const learner = await signIn('user');
    expect((await authed(learner.cookie, '/admin/stats')).status).toBe(403);
    expect((await authed(learner.cookie, '/admin/items')).status).toBe(403);
    const admin = await signIn('admin');
    expect((await authed(admin.cookie, '/admin/stats')).status).toBe(200);
  });

  it('a banned admin is refused', async () => {
    const admin = await signIn('admin');
    await env.DB.prepare('UPDATE "user" SET banned = 1 WHERE id = ?').bind(admin.userId).run();
    expect((await authed(admin.cookie, '/admin/stats')).status).toBe(401);
  });

  it('every admin route is behind the lock', async () => {
    const learner = await signIn('user');
    const routes: [string, string][] = [
      ['GET', '/admin/items/1'],
      ['POST', '/admin/items'],
      ['PATCH', '/admin/items/1'],
      ['DELETE', '/admin/items/1'],
      ['GET', '/admin/items/1/preview'],
      ['GET', '/admin/trash'],
      ['POST', '/admin/trash/1/restore'],
      ['DELETE', '/admin/trash/1'],
      ['GET', '/admin/categories'],
      ['POST', '/admin/categories'],
      ['PUT', '/admin/categories/order'],
      ['PATCH', '/admin/categories/1'],
      ['DELETE', '/admin/categories/1'],
      ['GET', '/admin/languages'],
      ['PATCH', '/admin/languages/en'],
      ['GET', '/admin/users'],
      ['PATCH', '/admin/users/x'],
      ['GET', '/admin/settings'],
      ['PUT', '/admin/settings'],
      ['GET', '/admin/audit'],
    ];
    for (const [method, path] of routes) {
      const res = await authed(learner.cookie, path, {
        method,
        ...(method === 'GET' ? {} : { json: {} }),
      });
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });
});

describe('admin in production: Cloudflare Access JWT (lock 2)', () => {
  const TEAM = 'myvocab-test.cloudflareaccess.com';
  const AUD = 'test-access-aud-tag';
  const prodEnv = {
    ...env,
    ENVIRONMENT: 'production',
    APP_URL: 'https://myvocab.example.workers.dev',
    TURNSTILE_SECRET_KEY: 'real-turnstile-secret',
    CF_ACCESS_TEAM_DOMAIN: TEAM,
    CF_ACCESS_AUD: AUD,
  } as unknown as Env;

  let privateKey: CryptoKey;
  let otherKey: CryptoKey;
  let jwk: Record<string, unknown>;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    otherKey = (await generateKeyPair('RS256')).privateKey;
    jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  });

  afterEach(() => vi.restoreAllMocks());

  function mockCerts() {
    const real = globalThis.fetch;
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === `https://${TEAM}/cdn-cgi/access/certs`) return Response.json({ keys: [jwk] });
      return real(input, init);
    });
  }

  async function token(
    email: string,
    opts: { aud?: string; iss?: string; exp?: string; key?: CryptoKey } = {},
  ) {
    return new SignJWT({ email })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(opts.iss ?? `https://${TEAM}`)
      .setAudience(opts.aud ?? AUD)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '5m')
      .sign(opts.key ?? privateKey);
  }

  /** A real production session cookie (`__Secure-` prefixed, signed with the auth secret). */
  async function prodSession(role: 'admin' | 'user', email: string): Promise<string> {
    const id = `prod_${role}`;
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, role)
       VALUES (?, 'P', ?, 1, ?, ?, ?)`,
    )
      .bind(id, email, now, now, role)
      .run();
    const ctx = await createAuth(loadConfig(prodEnv), createDb(env.DB)).$context;
    const session = await ctx.internalAdapter.createSession(id);
    const signed = `${session.token}.${await makeSignature(session.token, ctx.secret)}`;
    expect(ctx.authCookies.sessionToken.name).toBe('__Secure-better-auth.session_token');
    return `${ctx.authCookies.sessionToken.name}=${signed}`;
  }

  async function prodFetch(cookie: string, jwt?: string) {
    const ctx = createExecutionContext();
    const headers: Record<string, string> = { Cookie: cookie };
    if (jwt) headers['Cf-Access-Jwt-Assertion'] = jwt;
    const res = await createApp().fetch(
      new Request(`${BASE}/api/admin/stats`, { headers }),
      prodEnv,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    return res.status;
  }

  it('an admin session without an Access JWT is refused (fails closed)', async () => {
    mockCerts();
    const cookie = await prodSession('admin', 'boss@example.test');
    expect(await prodFetch(cookie)).toBe(403);
  });

  it('accepts a valid Access JWT for the same email (case-insensitive)', async () => {
    mockCerts();
    const cookie = await prodSession('admin', 'boss@example.test');
    expect(await prodFetch(cookie, await token('Boss@Example.test'))).toBe(200);
  });

  it('refuses an email mismatch, wrong audience or issuer, expiry and a foreign signature', async () => {
    mockCerts();
    const cookie = await prodSession('admin', 'boss@example.test');
    expect(await prodFetch(cookie, await token('someone@example.test'))).toBe(403);
    expect(await prodFetch(cookie, await token('boss@example.test', { aud: 'other' }))).toBe(403);
    expect(
      await prodFetch(cookie, await token('boss@example.test', { iss: 'https://evil.example' })),
    ).toBe(403);
    expect(await prodFetch(cookie, await token('boss@example.test', { exp: '1 minute ago' }))).toBe(
      403,
    );
    expect(await prodFetch(cookie, await token('boss@example.test', { key: otherKey }))).toBe(403);
    expect(await prodFetch(cookie, 'not-a-jwt')).toBe(403);
  });

  it('a valid Access JWT does not make a learner an admin', async () => {
    mockCerts();
    const cookie = await prodSession('user', 'learner@example.test');
    expect(await prodFetch(cookie, await token('learner@example.test'))).toBe(403);
  });
});
