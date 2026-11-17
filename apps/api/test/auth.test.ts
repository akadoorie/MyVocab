import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createAuth, isOwnerEmail, toSessionUser } from '../src/auth/auth';
import { loadConfig } from '../src/config';
import { createDb } from '../src/db/client';
import { api, authed, BASE, count, ORIGIN, postJson, signIn } from './helpers';

const config = () => loadConfig(env);
const SOURCE = { method: 'oauth', oauth: { providerId: 'google', profile: {} } } as const;
const testAuth = () => createAuth(config(), createDb(env.DB));

async function me(cookie?: string) {
  const res = cookie ? await authed(cookie, '/me') : await api('/me');
  expect(res.status).toBe(200);
  return (await res.json<{ user: Record<string, unknown> | null }>()).user;
}

async function userRow(email: string) {
  return env.DB.prepare('SELECT id, role, email_verified FROM "user" WHERE email = ?')
    .bind(email)
    .first<{ id: string; role: string; email_verified: number }>();
}

describe('GET /api/me', () => {
  it('is null for guests', async () => {
    expect(await me()).toBeNull();
  });

  it('returns the signed-in user from the session cookie', async () => {
    const { cookie } = await signIn('user', 'learner@example.test');
    expect(cookie).toMatch(/^better-auth\.session_token=/);
    expect(await me(cookie)).toEqual({
      id: expect.any(String) as string,
      name: 'Test user',
      email: 'learner@example.test',
      image: null,
      role: 'user',
      isOwner: false,
    });
  });

  it('ignores a tampered or unknown session cookie', async () => {
    const { cookie } = await signIn('user');
    expect(await me(`${cookie.slice(0, -4)}AAAA`)).toBeNull();
    expect(await me('better-auth.session_token=unknown.sig')).toBeNull();
  });

  it('treats a banned user as signed out', async () => {
    const { cookie, userId } = await signIn('user');
    await env.DB.prepare('UPDATE "user" SET banned = 1 WHERE id = ?').bind(userId).run();
    expect(await me(cookie)).toBeNull();
    // An expired ban no longer counts.
    await env.DB.prepare('UPDATE "user" SET ban_expires = ? WHERE id = ?')
      .bind(Date.now() - 1000, userId)
      .run();
    expect(await me(cookie)).not.toBeNull();
  });

  it('passes on the daily rolling refresh of the session cookie (and only then)', async () => {
    const { cookie, userId } = await signIn('user');
    const fresh = await authed(cookie, '/me');
    expect(fresh.headers.get('Set-Cookie')).toBeNull();
    // Make the session two days old: the next use refreshes it (updateAge = 1 day).
    const day = 24 * 60 * 60 * 1000;
    await env.DB.prepare('UPDATE session SET expires_at = ? WHERE user_id = ?')
      .bind(Date.now() + 28 * day, userId)
      .run();
    const res = await authed(cookie, '/me');
    expect(res.headers.get('Set-Cookie')).toMatch(/better-auth\.session_token=/);
    const row = await env.DB.prepare('SELECT expires_at FROM session WHERE user_id = ?')
      .bind(userId)
      .first<{ expires_at: number }>();
    expect(row!.expires_at).toBeGreaterThan(Date.now() + 29 * day);
  });
});

describe('owners and roles (PRD §13.2)', () => {
  it('a new owner with a verified email becomes admin; unverified or other emails do not', async () => {
    const ctx = await testAuth().$context;
    await ctx.internalAdapter.createUser(
      {
        email: 'OWNER@example.test',
        name: 'Owner',
        emailVerified: true,
      },
      SOURCE,
    );
    await ctx.internalAdapter.createUser(
      {
        email: 'someone@example.test',
        name: 'Someone',
        emailVerified: true,
      },
      SOURCE,
    );
    expect((await userRow('owner@example.test'))?.role).toBe('admin');
    expect((await userRow('someone@example.test'))?.role).toBe('user');
  });

  it('an unverified owner email is not promoted', async () => {
    const ctx = await testAuth().$context;
    const u = await ctx.internalAdapter.createUser(
      {
        email: 'owner@example.test',
        name: 'Owner',
        emailVerified: false,
      },
      SOURCE,
    );
    await ctx.internalAdapter.createSession(u.id);
    expect((await userRow('owner@example.test'))?.role).toBe('user');
  });

  it('an existing user added to ADMIN_EMAILS is promoted at the next sign-in', async () => {
    const { cookie } = await signIn('user', 'owner@example.test');
    expect(await me(cookie)).toMatchObject({ role: 'admin', isOwner: true });
  });

  it('isOwnerEmail and toSessionUser', () => {
    const owners = new Set(['a@x.test']);
    expect(isOwnerEmail({ email: 'A@x.test', emailVerified: true }, owners)).toBe(true);
    expect(isOwnerEmail({ email: 'a@x.test', emailVerified: false }, owners)).toBe(false);
    const base = { id: 'u', name: 'N', email: 'a@x.test', emailVerified: true };
    expect(toSessionUser({ ...base, role: 'superuser' }, owners)?.role).toBe('user');
    expect(toSessionUser({ ...base, banned: true }, owners)).toBeNull();
    expect(
      toSessionUser({ ...base, banned: true, banExpires: new Date(Date.now() + 60_000) }, owners),
    ).toBeNull();
  });
});

describe('privacy of auth data (PRD §14.4)', () => {
  it('stores no IP address or user agent on sessions', async () => {
    await signIn('user');
    const row = await env.DB.prepare('SELECT ip_address, user_agent FROM session').first();
    expect(row).toEqual({ ip_address: null, user_agent: null });
  });

  it('never stores Google tokens', async () => {
    const ctx = await testAuth().$context;
    const u = await ctx.internalAdapter.createUser(
      {
        email: 'g@example.test',
        name: 'G',
        emailVerified: true,
      },
      SOURCE,
    );
    await ctx.internalAdapter.createAccount({
      userId: u.id,
      providerId: 'google',
      accountId: 'google-sub-1',
      accessToken: 'secret-access',
      refreshToken: 'secret-refresh',
      idToken: 'secret-id',
    });
    const row = await env.DB.prepare(
      'SELECT access_token, refresh_token, id_token FROM account WHERE account_id = ?',
    )
      .bind('google-sub-1')
      .first();
    expect(row).toEqual({ access_token: null, refresh_token: null, id_token: null });
  });
});

describe('/api/auth/* (Better Auth)', () => {
  it('starts Google sign-in without writing to D1 and only for same-site callbacks', async () => {
    const res = await postJson('/auth/sign-in/social', { provider: 'google', callbackURL: '/' });
    expect(res.status).toBe(200);
    const body = await res.json<{ url: string; redirect: boolean }>();
    expect(new URL(body.url).hostname).toBe('accounts.google.com');
    expect(new URL(body.url).searchParams.get('redirect_uri')).toBe(
      `${ORIGIN}/api/auth/callback/google`,
    );
    expect(res.headers.get('Set-Cookie')).toMatch(/state/i);
    expect(await count('verification')).toBe(0);
    expect(await count('"user"')).toBe(0);
  });

  it('refuses other providers, extra fields and foreign callback URLs', async () => {
    for (const body of [
      { provider: 'github', callbackURL: '/' },
      { provider: 'google', callbackURL: '/', idToken: { token: 'x' } },
      { provider: 'google', callbackURL: 'https://evil.example/' },
      { provider: 'google', callbackURL: '//evil.example/' },
    ]) {
      expect((await postJson('/auth/sign-in/social', body)).status).toBe(400);
    }
  });

  it('refuses every Better Auth endpoint the app does not use', async () => {
    const { cookie } = await signIn('admin');
    const refused: [string, string][] = [
      ['GET', '/auth/get-session'],
      ['GET', '/auth/list-sessions'],
      ['POST', '/auth/sign-up/email'],
      ['POST', '/auth/sign-in/email'],
      ['POST', '/auth/update-user'],
      ['POST', '/auth/delete-user'],
      ['POST', '/auth/admin/set-role'],
      ['POST', '/auth/admin/impersonate-user'],
      ['GET', '/auth/admin/list-users'],
    ];
    for (const [method, path] of refused) {
      const res = await authed(cookie, path, {
        method,
        ...(method === 'POST' ? { json: {} } : {}),
      });
      expect(res.status, `${method} ${path}`).toBe(404);
    }
  });

  it('signs out: the session row is deleted and the cookie cleared', async () => {
    const { cookie } = await signIn('user');
    const res = await authed(cookie, '/auth/sign-out', { method: 'POST', json: {} });
    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toMatch(/better-auth\.session_token=;/);
    expect(await count('session')).toBe(0);
    expect(await me(cookie)).toBeNull();
  });
});

describe('/api/test/session (PRD §12.5)', () => {
  async function fetchWith(overrides: Record<string, string>, path: string, init: RequestInit) {
    const ctx = createExecutionContext();
    const res = await createApp().fetch(
      new Request(`${BASE}/api${path}`, init),
      { ...env, ...overrides } as unknown as Env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    return res;
  }

  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ role: 'admin' }),
  };

  it('does not exist outside ENVIRONMENT=test', async () => {
    const res = await fetchWith({ ENVIRONMENT: 'development' }, '/test/session', init);
    expect(res.status).toBe(404);
    expect(await count('"user"')).toBe(0);
  });

  it('test mode is refused on anything but a localhost APP_URL', () => {
    expect(() =>
      loadConfig({ ...env, APP_URL: 'https://myvocab.example.workers.dev' } as unknown as Env),
    ).toThrow(/localhost/);
  });

  it('validates its input', async () => {
    expect((await postJson('/test/session', { role: 'owner' })).status).toBe(400);
    expect((await postJson('/test/session', { role: 'user', extra: 1 })).status).toBe(400);
  });
});
