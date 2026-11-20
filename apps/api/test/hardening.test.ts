import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import {
  api,
  authed,
  BASE,
  itemId,
  mockTurnstile,
  ORIGIN,
  postJson,
  seedFixtures,
  signIn,
} from './helpers';

/** Every table's full content, to prove a request wrote nothing (PRD §11.2 rules 5–6). */
async function snapshot(): Promise<string> {
  const { results } = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all<{ name: string }>();
  const out: Record<string, unknown> = {};
  for (const { name } of results) {
    out[name] = (await env.DB.prepare(`SELECT * FROM "${name}" ORDER BY 1, 2`).all()).results;
  }
  return JSON.stringify(out);
}

beforeEach(seedFixtures);

describe('security headers (PRD §14.4)', () => {
  it('every /api response is noindex, no-store and carries the security headers', async () => {
    for (const res of [await api('/health'), await api('/meta'), await api('/nope')]) {
      expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
      expect(res.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
      expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=');
      expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    }
  });

  it('production errors are generic', async () => {
    const res = await api('/admin/items/not-a-number', { headers: {} });
    expect(res.status).toBe(401);
    const body = await res.text();
    expect(body).not.toMatch(/SELECT|sqlite|stack|at .*\.ts/i);
  });
});

describe('burst limits (PRD §14.3)', () => {
  const refuse = { limit: async () => ({ success: false }) };

  async function fetchWith(overrides: Record<string, unknown>, path: string, init: RequestInit) {
    const ctx = createExecutionContext();
    const res = await createApp().fetch(
      new Request(`${BASE}/api${path}`, init),
      { ...env, ...overrides } as unknown as Env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    return res;
  }

  it('over the limit: 429 before anything else, and nothing is written', async () => {
    const before = await snapshot();
    const fetchSpy = mockTurnstile(true);
    const loop = await fetchWith({ RL_LOOPS: refuse }, '/loops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({
        source: 'en',
        target: 'he',
        type: 'word',
        topicId: null,
        turnstileToken: 't',
      }),
    });
    expect(loop.status).toBe(429);
    expect(fetchSpy).not.toHaveBeenCalled(); // not even the Turnstile call
    fetchSpy.mockRestore();
    const available = await fetchWith(
      { RL_AVAILABLE: refuse },
      '/loops/available?source=en&target=he&type=word',
      {},
    );
    expect(available.status).toBe(429);
    const auth = await fetchWith({ RL_AUTH: refuse }, '/auth/sign-in/social', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ provider: 'google', callbackURL: '/' }),
    });
    expect(auth.status).toBe(429);
    expect(await snapshot()).toBe(before);
  });

  it('admin routes are limited per admin', async () => {
    const admin = await signIn('admin');
    const res = await fetchWith({ RL_ADMIN: refuse }, '/admin/stats', {
      headers: { Cookie: admin.cookie },
    });
    expect(res.status).toBe(429);
  });
});

describe('write discipline (PRD §11.2)', () => {
  it('read-only requests of guests, learners and admins write nothing', async () => {
    const learner = await signIn('user');
    const admin = await signIn('admin');
    const id = await itemId('fx-word-1');
    await authed(learner.cookie, '/me/known', {
      method: 'POST',
      json: { items: [{ itemId: id, target: 'he', cycle: 1 }] },
    });
    const before = await snapshot();
    const reads = [
      api('/meta'),
      api('/loops/available?source=en&target=he&type=word'),
      api('/me'),
      authed(learner.cookie, '/me'),
      authed(learner.cookie, '/loops/available?source=en&target=en&type=word'),
      authed(learner.cookie, '/me/known?sort=az'),
      ...[
        '/admin/stats',
        '/admin/items',
        `/admin/items/${id}`,
        `/admin/items/${id}/preview`,
        '/admin/trash',
        '/admin/topics',
        '/admin/languages',
        '/admin/users',
        '/admin/settings',
        '/admin/audit',
        '/admin/import/template',
      ].map((p) => authed(admin.cookie, p)),
    ];
    for (const res of await Promise.all(reads)) expect(res.status).toBe(200);
    expect(await snapshot()).toBe(before);
  });

  it('refused requests write nothing (CSRF, auth, validation, bot check)', async () => {
    const learner = await signIn('user');
    const before = await snapshot();
    const fetchSpy = mockTurnstile(false);
    const refused = [
      await api('/loops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
      await postJson('/loops', {
        source: 'en',
        target: 'he',
        type: 'word',
        topicId: null,
        turnstileToken: 'x',
      }),
      await postJson('/me/known', { items: [{ itemId: 1, target: 'he', cycle: 1 }] }),
      await authed(learner.cookie, '/admin/items', {
        method: 'POST',
        json: { lang: 'en', text: 'x', type: 'word' },
      }),
      await authed(learner.cookie, '/me/known', { method: 'POST', json: { items: [] } }),
    ];
    fetchSpy.mockRestore();
    expect(refused.map((r) => r.status)).toEqual([403, 403, 401, 403, 400]);
    expect(await snapshot()).toBe(before);
  });

  it('a learner loop start writes exactly one usage counter row', async () => {
    const learner = await signIn('user');
    const count = async () =>
      (await env.DB.prepare('SELECT COUNT(*) AS n FROM usage_counters').first<{ n: number }>())!.n;
    expect(await count()).toBe(0);
    const res = await authed(learner.cookie, '/loops', {
      method: 'POST',
      json: { source: 'en', target: 'he', type: 'word', topicId: null, size: 10 },
    });
    expect(res.status).toBe(200);
    expect(await count()).toBe(1);
  });
});
