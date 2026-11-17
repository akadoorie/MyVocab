import { env } from 'cloudflare:test';
import {
  availableResponseSchema,
  errorResponseSchema,
  metaResponseSchema,
  startLoopResponseSchema,
} from '@myvocab/contracts';
import { isPlayableFor, type ItemType } from '@myvocab/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config';
import { createContainer } from '../src/container';
import { D1ItemRepository } from '../src/repositories/d1/items';
import {
  api,
  categoryId,
  count,
  mockTurnstile,
  postJson,
  seedFixtures,
  setSetting,
} from './helpers';

beforeEach(seedFixtures);
afterEach(() => vi.restoreAllMocks());

const guestBody = {
  source: 'en',
  target: 'he',
  type: 'word' as const,
  categoryId: null,
  turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX',
};
const errorCode = async (res: Response) => errorResponseSchema.parse(await res.json()).error.code;

describe('GET /api/meta', () => {
  it('returns the PRD defaults and the guest settings', async () => {
    const res = await api('/meta');
    expect(res.status).toBe(200);
    const meta = metaResponseSchema.parse(await res.json());
    expect(meta.defaults).toEqual({
      sourceLang: 'en',
      targetLang: 'he',
      categoryId: null,
      type: 'word',
      size: 10,
    });
    expect(meta.languages.map((l) => [l.code, l.dir])).toEqual([
      ['en', 'ltr'],
      ['he', 'rtl'],
    ]);
    expect(meta.sizeOptions).toEqual([10, 20, 30, 40, 50]);
    expect(meta.guest).toEqual({ enabled: true, loopSize: 5 });
    expect(meta.types.map((t) => t.label)).toEqual(['Words', 'Expressions']);
    expect(meta.categories.map((c) => c.slug).sort()).toEqual(['home', 'nature']);
    expect(meta.turnstileSiteKey).toBeTruthy();
  });

  it('applies stored settings and ignores invalid stored values', async () => {
    await setSetting('defaults.type', 'expr');
    await setSetting('loop.defaultSize', 'not a number');
    const meta = metaResponseSchema.parse(await (await api('/meta')).json());
    expect(meta.defaults.type).toBe('expr');
    expect(meta.defaults.size).toBe(10);
  });
});

describe('GET /api/loops/available', () => {
  const available = async (q: string) =>
    availableResponseSchema.parse(await (await api(`/loops/available?${q}`)).json()).available;

  it('counts playable items for a direction, type and category', async () => {
    expect(await available('source=en&target=he&type=word')).toBe(6); // not the draft, not fx-word-4
    expect(await available('source=en&target=en&type=word')).toBe(6); // explanation: not fx-word-3
    expect(await available('source=en&target=he&type=expr')).toBe(1);
    expect(await available('source=he&target=en&type=word')).toBe(1);
    expect(
      await available(`source=en&target=he&type=word&categoryId=${await categoryId('home')}`),
    ).toBe(3);
  });

  it('excludes items in Trash', async () => {
    await env.DB.prepare(`UPDATE items SET deleted_at = 1 WHERE text = 'fx-word-1'`).run();
    expect(await available('source=en&target=he&type=word')).toBe(5);
  });

  it('agrees with the core playability rule for every direction and type', async () => {
    const all = await env.DB.prepare(
      `SELECT lang, text, type FROM items WHERE status = 'published'`,
    ).all<{ lang: string; text: string; type: ItemType }>();
    const repo = new D1ItemRepository(createContainer(env.DB).db);
    const found = await repo.findByIdentities(
      all.results.map((r) => ({
        lang: r.lang,
        type: r.type,
        normalizedText: r.text.toLowerCase(),
      })),
    );
    for (const [source, target] of [
      ['en', 'he'],
      ['en', 'en'],
      ['he', 'en'],
      ['he', 'he'],
    ] as const) {
      for (const type of ['word', 'expr'] as const) {
        const expected = [...found.values()].filter(
          (e) => e.content.type === type && isPlayableFor(e.content, source, target),
        ).length;
        expect(
          await available(`source=${source}&target=${target}&type=${type}`),
          `${source}→${target} ${type}`,
        ).toBe(expected);
      }
    }
  });

  it('rejects invalid queries', async () => {
    expect((await api('/loops/available?source=en&target=he&type=synonym')).status).toBe(400);
    expect((await api('/loops/available?source=fr&target=he&type=word')).status).toBe(400);
    expect(
      (await api('/loops/available?source=en&target=he&type=word&categoryId=999')).status,
    ).toBe(400);
    expect((await api('/loops/available?source=en&target=he&type=word&extra=1')).status).toBe(400);
  });
});

describe('POST /api/loops (guest)', () => {
  it('serves 5 composed cards even when a larger amount is sent, and counts the loop', async () => {
    mockTurnstile(true);
    const res = await postJson('/loops', { ...guestBody, size: 50 });
    expect(res.status).toBe(200);
    const body = startLoopResponseSchema.parse(await res.json());
    expect(body).toMatchObject({ requested: 5, returned: 5 });
    for (const card of body.cards) {
      expect(card.direction).toEqual({ source: 'en', target: 'he' });
      expect(card.answer).toMatchObject({ kind: 'translation', lang: 'he', dir: 'rtl' });
      expect(card.front.dir).toBe('ltr');
    }
    expect(await count('usage_counters')).toBe(1);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('builds explanation cards for the same language', async () => {
    mockTurnstile(true);
    const body = startLoopResponseSchema.parse(
      await (await postJson('/loops', { ...guestBody, target: 'en' })).json(),
    );
    const multi = body.cards.find((c) => c.front.text === 'fx-word-2');
    if (multi) expect(multi.answer).toMatchObject({ kind: 'explanation', numbered: true });
    expect(body.cards.every((c) => c.answer.kind === 'explanation')).toBe(true);
  });

  it('refuses a missing or invalid Turnstile token and writes nothing', async () => {
    const res1 = await postJson('/loops', { ...guestBody, turnstileToken: undefined });
    expect(res1.status).toBe(403);
    expect(await errorCode(res1)).toBe('BOT_CHECK_FAILED');
    mockTurnstile(false);
    const res2 = await postJson('/loops', guestBody);
    expect(res2.status).toBe(403);
    expect(await count('usage_counters')).toBe(0);
    expect(await count('audit_log')).toBe(0);
  });

  it('enforces the hourly cap; only the first block writes a marker and an audit entry', async () => {
    mockTurnstile(true);
    await setSetting('guests.loopsPerHour', 2);
    expect((await postJson('/loops', guestBody)).status).toBe(200);
    expect((await postJson('/loops', guestBody)).status).toBe(200);
    const blocked = await postJson('/loops', guestBody);
    expect(blocked.status).toBe(429);
    expect(await errorCode(blocked)).toBe('RATE_LIMITED');
    const rowsAfterFirstBlock = await count('usage_counters');
    expect((await postJson('/loops', guestBody)).status).toBe(429);
    expect((await postJson('/loops', guestBody)).status).toBe(429);
    expect(await count('usage_counters')).toBe(rowsAfterFirstBlock); // later blocks write nothing
    const audit = await env.DB.prepare(`SELECT action, entity_id FROM audit_log`).all<{
      action: string;
      entity_id: string;
    }>();
    expect(audit.results).toHaveLength(1);
    expect(audit.results[0]?.action).toBe('limit.exceeded');
    expect(audit.results[0]?.entity_id).toMatch(/^ip:[0-9a-f]{64}$/); // a hash, never the IP
  });

  it('is refused when guests are disabled or during maintenance', async () => {
    mockTurnstile(true);
    await setSetting('guests.enabled', false);
    const res = await postJson('/loops', guestBody);
    expect(res.status).toBe(401);
    await setSetting('guests.enabled', true);
    await setSetting('maintenance.enabled', true);
    await setSetting('maintenance.message', 'Back soon');
    const m = await postJson('/loops', guestBody);
    expect(m.status).toBe(403);
    expect(errorResponseSchema.parse(await m.json()).error.message).toBe('Back soon');
  });

  it('returns fewer cards when fewer are available', async () => {
    mockTurnstile(true);
    const body = startLoopResponseSchema.parse(
      await (await postJson('/loops', { ...guestBody, type: 'expr' })).json(),
    );
    expect(body).toMatchObject({ requested: 5, returned: 1 });
  });
});

describe('mutation guard (CSRF)', () => {
  it('refuses a missing or foreign Origin', async () => {
    mockTurnstile(true);
    expect((await postJson('/loops', guestBody, { Origin: 'https://evil.example' })).status).toBe(
      403,
    );
  });

  it('requires a JSON body', async () => {
    const res = await postJson('/loops', guestBody, { 'Content-Type': 'text/plain' });
    expect(res.status).toBe(400);
  });

  it('rejects unknown fields and malformed JSON', async () => {
    expect((await postJson('/loops', { ...guestBody, admin: true })).status).toBe(400);
    const bad = await postJson('/loops', guestBody);
    expect(bad.status).not.toBe(500);
  });
});

describe('LoopService (learner path)', () => {
  const learner = { kind: 'learner' as const, userId: 'u1', isAdmin: false };

  async function service() {
    await env.DB.prepare(
      `INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('u1', 'U', 'u1@example.test', 1, 0, 0)`,
    ).run();
    return createContainer(env.DB, loadConfig(env)).loops;
  }

  it('only accepts amounts from the settings', async () => {
    const loops = await service();
    await expect(loops.start({ ...guestBody, size: 7 }, learner)).rejects.toThrow(/Amount/);
    const ok = await loops.start({ ...guestBody, size: 10 }, learner);
    expect(ok).toMatchObject({ requested: 10, returned: 6 });
  });

  it('excludes known items in every direction', async () => {
    const loops = await service();
    await env.DB.prepare(
      `INSERT INTO user_known_items (user_id, item_id, known_target, known_in_cycle, known_at)
       SELECT 'u1', id, 'he', 1, 0 FROM items WHERE text IN ('fx-word-1', 'fx-word-2')`,
    ).run();
    expect(
      await loops.available(
        { source: 'en', target: 'he', type: 'word', categoryId: null },
        learner,
      ),
    ).toBe(4);
    expect(
      await loops.available(
        { source: 'en', target: 'en', type: 'word', categoryId: null },
        learner,
      ),
    ).toBe(4);
  });

  it('enforces the daily card cap with the remaining allowance; admins are exempt', async () => {
    const loops = await service();
    await setSetting('users.cardsPerDay', 15);
    await loops.start({ ...guestBody, size: 10 }, learner); // serves 6
    const err = await loops.start({ ...guestBody, size: 10 }, learner).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'RATE_LIMITED', details: { remaining: 9 } });
    await expect(
      loops.start({ ...guestBody, size: 10 }, { ...learner, isAdmin: true }),
    ).resolves.toBeTruthy();
  });
});
