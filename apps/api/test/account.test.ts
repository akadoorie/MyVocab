import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { authed, count, itemId, mockTurnstile, seedFixtures, setSetting, signIn } from './helpers';

beforeEach(seedFixtures);

async function deleteMe(cookie: string, json: unknown = { confirm: 'DELETE' }) {
  return authed(cookie, '/me', { method: 'DELETE', json });
}

describe('DELETE /api/me (FR-L71)', () => {
  it('needs the typed confirmation and a session', async () => {
    const { cookie } = await signIn();
    expect((await deleteMe(cookie, {})).status).toBe(400);
    expect((await deleteMe(cookie, { confirm: 'delete' })).status).toBe(400);
    expect((await deleteMe('better-auth.session_token=x.y')).status).toBe(401);
  });

  it('deletes the user, sessions, known items and usage counters, and clears the cookie', async () => {
    const { cookie, userId } = await signIn('user', 'gone@example.test');
    const other = await signIn('user', 'stays@example.test');
    await authed(cookie, '/me/known', {
      method: 'POST',
      json: { items: [{ itemId: await itemId('fx-word-1'), target: 'he', round: 1 }] },
    });
    await authed(other.cookie, '/me/known', {
      method: 'POST',
      json: { items: [{ itemId: await itemId('fx-word-1'), target: 'he', round: 1 }] },
    });
    await authed(cookie, '/practices', {
      method: 'POST',
      json: { source: 'en', target: 'he', topicId: null, size: 10 },
    });
    expect(await count('usage_counters')).toBe(1);

    const res = await deleteMe(cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toMatch(/better-auth\.session_token=;/);

    const left = async (sql: string) => (await env.DB.prepare(sql).bind(userId).first())?.n;
    expect(await left('SELECT COUNT(*) AS n FROM "user" WHERE id = ?')).toBe(0);
    expect(await left('SELECT COUNT(*) AS n FROM session WHERE user_id = ?')).toBe(0);
    expect(await left('SELECT COUNT(*) AS n FROM user_known_items WHERE user_id = ?')).toBe(0);
    expect(await count('usage_counters')).toBe(0);
    // The other user is untouched; the audit entry keeps only the id.
    expect(await count('user_known_items')).toBe(1);
    const audit = await env.DB.prepare(
      'SELECT action, entity_id, actor_email FROM audit_log',
    ).all();
    expect(audit.results).toEqual([
      { action: 'user.self_delete', entity_id: userId, actor_email: null },
    ]);
    expect((await authed(cookie, '/me').then((r) => r.json<{ user: unknown }>())).user).toBeNull();
  });

  it('the last admin cannot delete their account; with another admin they can', async () => {
    const first = await signIn('admin', 'admin1@example.test');
    const res = await deleteMe(first.cookie);
    expect(res.status).toBe(409);
    await signIn('admin', 'admin2@example.test');
    expect((await deleteMe(first.cookie)).status).toBe(200);
  });
});

describe('POST /api/practices (signed-in learner)', () => {
  const body = { source: 'en', target: 'he', topicId: null };

  it('accepts the amounts from the settings without Turnstile and excludes known items', async () => {
    const fetchSpy = mockTurnstile(false);
    const { cookie } = await signIn();
    const known = await itemId('fx-word-1');
    await authed(cookie, '/me/known', {
      method: 'POST',
      json: { items: [{ itemId: known, target: 'he', round: 1 }] },
    });
    const res = await authed(cookie, '/practices', { method: 'POST', json: { ...body, size: 20 } });
    expect(res.status).toBe(200);
    const practice = await res.json<{ requested: number; cards: { itemId: number }[] }>();
    expect(practice.requested).toBe(20);
    expect(practice.cards.map((c) => c.itemId)).not.toContain(known);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    const bad = await authed(cookie, '/practices', { method: 'POST', json: { ...body, size: 7 } });
    expect(bad.status).toBe(400);
  });

  it('enforces the daily cap with the remaining allowance; admins are exempt', async () => {
    await setSetting('users.cardsPerDay', 12);
    const { cookie } = await signIn();
    const ok = await authed(cookie, '/practices', { method: 'POST', json: { ...body, size: 10 } });
    expect(ok.status).toBe(200);
    const served = (await ok.json<{ returned: number }>()).returned;
    const capped = await authed(cookie, '/practices', {
      method: 'POST',
      json: { ...body, size: 10 },
    });
    expect(capped.status).toBe(429);
    const err = await capped.json<{ error: { code: string; details: { remaining: number } } }>();
    expect(err.error).toMatchObject({ code: 'RATE_LIMITED', details: { remaining: 12 - served } });

    const admin = await signIn('admin');
    for (let i = 0; i < 3; i++) {
      const r = await authed(admin.cookie, '/practices', {
        method: 'POST',
        json: { ...body, size: 10 },
      });
      expect(r.status).toBe(200);
    }
  });
});
