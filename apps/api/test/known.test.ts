import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, authed, topicId, count, itemId, postJson, seedFixtures, signIn } from './helpers';

type ListBody = {
  items: {
    itemId: number;
    text: string;
    knownTarget: string;
    knownInRound: number;
    knownAt: number;
    answer: { kind: string; lines: string[]; numbered: boolean; lang: string; dir: string };
    topics: { id: number; name: string }[];
  }[];
  nextCursor: string | null;
  total: number | null;
};

async function mark(cookie: string, items: { itemId: number; target: string; round: number }[]) {
  return authed(cookie, '/me/known', { method: 'POST', json: { items } });
}

async function list(cookie: string, query = ''): Promise<ListBody> {
  const res = await authed(cookie, `/me/known${query}`);
  expect(res.status).toBe(200);
  return res.json<ListBody>();
}

async function available(cookie: string, source: string, target: string) {
  const res = await authed(cookie, `/practices/available?source=${source}&target=${target}`);
  return (await res.json<{ available: number }>()).available;
}

beforeEach(seedFixtures);

describe('known items require a session', () => {
  it('answers 401 to guests on every endpoint', async () => {
    expect((await api('/me/known')).status).toBe(401);
    expect((await postJson('/me/known', { items: [] })).status).toBe(401);
    expect((await postJson('/me/known/restore', { itemIds: [1] })).status).toBe(401);
    const del = await api('/me/known/1', {
      method: 'DELETE',
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(del.status).toBe(401);
  });
});

describe('POST /api/me/known', () => {
  it('still accepts a mark sent with the old field name `cycle` (a page from before the rename)', async () => {
    const { cookie } = await signIn();
    const id = await itemId('fx-word-1');
    const res = await authed(cookie, '/me/known', {
      method: 'POST',
      json: { items: [{ itemId: id, target: 'he', cycle: 2 }] },
    });
    expect(await res.json()).toEqual({ saved: 1 });
    expect((await list(cookie)).items[0]).toMatchObject({ knownInRound: 2 });
  });

  it('is an idempotent upsert per direction that keeps the first mark (D-028)', async () => {
    const { cookie } = await signIn();
    const id = await itemId('fx-word-1');
    const first = await mark(cookie, [{ itemId: id, target: 'he', round: 1 }]);
    expect(await first.json()).toEqual({ saved: 1 });
    const before = await list(cookie);
    const again = await mark(cookie, [{ itemId: id, target: 'he', round: 3 }]);
    expect(await again.json()).toEqual({ saved: 0 });
    const after = await list(cookie);
    expect(after.items).toHaveLength(1);
    expect(after.items[0]).toMatchObject({ knownTarget: 'he', knownInRound: 1 });
    expect(after.items[0]?.knownAt).toBe(before.items[0]?.knownAt);
    // The same item in another direction is a mark of its own: two rows, topics once each.
    const other = await mark(cookie, [{ itemId: id, target: 'en', round: 2 }]);
    expect(await other.json()).toEqual({ saved: 1 });
    const rows = (await list(cookie)).items;
    expect(rows.map((i) => i.knownTarget).sort()).toEqual(['en', 'he']);
    for (const row of rows)
      expect(row.topics).toEqual([{ id: expect.any(Number), name: 'Home', nameHe: null }]);
  });

  it('skips missing and trashed items and duplicates within a batch', async () => {
    const { cookie } = await signIn();
    const a = await itemId('fx-word-1');
    const b = await itemId('fx-word-3');
    await env.DB.prepare('UPDATE items SET deleted_at = ? WHERE id = ?').bind(Date.now(), b).run();
    const res = await mark(cookie, [
      { itemId: a, target: 'he', round: 1 },
      { itemId: a, target: 'he', round: 2 },
      { itemId: b, target: 'he', round: 1 },
      { itemId: 999_999, target: 'he', round: 1 },
    ]);
    expect(await res.json()).toEqual({ saved: 1 });
    expect(await count('user_known_items')).toBe(1);
  });

  it('validates the batch strictly', async () => {
    const { cookie } = await signIn();
    const one = { itemId: 1, target: 'he', round: 1 };
    for (const json of [
      { items: [] },
      { items: Array.from({ length: 101 }, (_, i) => ({ ...one, itemId: i + 1 })) },
      { items: [{ ...one, round: 0 }] },
      { items: [{ ...one, userId: 'someone-else' }] },
      { items: [one], userId: 'someone-else' },
    ]) {
      expect((await authed(cookie, '/me/known', { method: 'POST', json })).status).toBe(400);
    }
  });

  it('hides a known item only in the direction it was marked in (FR-L54, D-028)', async () => {
    const { cookie } = await signIn();
    const enEn = await available(cookie, 'en', 'en');
    const enHe = await available(cookie, 'en', 'he');
    const heEn = await available(cookie, 'he', 'en');
    const id = await itemId('fx-word-1');
    await mark(cookie, [{ itemId: id, target: 'he', round: 1 }]);
    expect(await available(cookie, 'en', 'he')).toBe(enHe - 1);
    // Its explanation direction (EN → EN) is a direction of its own.
    expect(await available(cookie, 'en', 'en')).toBe(enEn);
    expect(await available(cookie, 'he', 'en')).toBe(heEn);
    await mark(cookie, [{ itemId: id, target: 'en', round: 1 }]);
    expect(await available(cookie, 'en', 'en')).toBe(enEn - 1);
    // A guest's counts are not affected.
    const guest = await api('/practices/available?source=en&target=he');
    expect((await guest.json<{ available: number }>()).available).toBe(enHe);
  });
});

describe('DELETE /api/me/known/:itemId and restore', () => {
  it('undo removes one direction; without a target, every direction (D-028)', async () => {
    const { cookie } = await signIn();
    const id = await itemId('fx-word-1');
    const both = [
      { itemId: id, target: 'he', round: 1 },
      { itemId: id, target: 'en', round: 1 },
    ];
    await mark(cookie, both);
    const one = await authed(cookie, `/me/known/${id}?target=he`, { method: 'DELETE' });
    expect(await one.json()).toEqual({ removed: 1 });
    expect((await list(cookie)).items.map((i) => i.knownTarget)).toEqual(['en']);

    await mark(cookie, both);
    const all = await authed(cookie, `/me/known/${id}`, { method: 'DELETE' });
    expect(await all.json()).toEqual({ removed: 2 });
    expect(await count('user_known_items')).toBe(0);
    expect((await authed(cookie, '/me/known/abc', { method: 'DELETE' })).status).toBe(400);
    expect((await authed(cookie, `/me/known/${id}?target=HE`, { method: 'DELETE' })).status).toBe(
      400,
    );
  });

  it("user A can't read or change user B's known items", async () => {
    const a = await signIn('user', 'a@example.test');
    const b = await signIn('user', 'b@example.test');
    const id = await itemId('fx-word-1');
    await mark(a.cookie, [{ itemId: id, target: 'he', round: 1 }]);
    const del = await authed(b.cookie, `/me/known/${id}`, { method: 'DELETE' });
    expect(await del.json()).toEqual({ removed: 0 });
    const restore = await authed(b.cookie, '/me/known/restore', {
      method: 'POST',
      json: { filter: {} },
    });
    expect(await restore.json()).toEqual({ restored: 0 });
    expect((await list(b.cookie)).items).toHaveLength(0);
    expect((await list(a.cookie)).items).toHaveLength(1);
  });

  it('restores by ids or by filter, never touching items in Trash', async () => {
    const { cookie } = await signIn();
    const ids = await Promise.all(
      ['fx-word-1', 'fx-word-2', 'fx-word-3', 'fx-expr-1'].map((t) => itemId(t)),
    );
    await mark(
      cookie,
      ids.map((id) => ({ itemId: id, target: 'he', round: 1 })),
    );
    const byIds = await authed(cookie, '/me/known/restore', {
      method: 'POST',
      json: { itemIds: [ids[0], ids[0]] },
    });
    expect(await byIds.json()).toEqual({ restored: 1 });

    // fx-word-3 goes to Trash: "return all filtered" keeps its mark for a later restore.
    await env.DB.prepare('UPDATE items SET deleted_at = ? WHERE id = ?')
      .bind(Date.now(), ids[2])
      .run();
    const byFilter = await authed(cookie, '/me/known/restore', {
      method: 'POST',
      json: { filter: { q: 'fx-word-2' } },
    });
    expect(await byFilter.json()).toEqual({ restored: 1 }); // fx-word-2 only
    const left = await env.DB.prepare(
      'SELECT item_id FROM user_known_items ORDER BY item_id',
    ).all();
    expect(left.results.map((r) => r.item_id)).toEqual([ids[2], ids[3]]);

    const bad = await authed(cookie, '/me/known/restore', {
      method: 'POST',
      json: { itemIds: [1], filter: {} },
    });
    expect(bad.status).toBe(400);
  });

  it('restores rows per direction, by rows or by a direction filter (D-028)', async () => {
    const { cookie } = await signIn();
    const [a, b] = await Promise.all(['fx-word-1', 'fx-word-2'].map((t) => itemId(t)));
    const everything = [a!, b!].flatMap((id) => [
      { itemId: id, target: 'he', round: 1 },
      { itemId: id, target: 'en', round: 1 },
    ]);
    const rows = async () =>
      (
        await env.DB.prepare(
          'SELECT item_id, known_target FROM user_known_items ORDER BY item_id, known_target',
        ).all<{ item_id: number; known_target: string }>()
      ).results.map((r) => `${r.item_id}:${r.known_target}`);

    await mark(cookie, everything);
    const byRows = await authed(cookie, '/me/known/restore', {
      method: 'POST',
      json: {
        marks: [
          { itemId: a, target: 'he' },
          { itemId: a, target: 'he' },
        ],
      },
    });
    expect(await byRows.json()).toEqual({ restored: 1 });
    expect(await rows()).toEqual([`${a}:en`, `${b}:en`, `${b}:he`]);

    const byDirection = await authed(cookie, '/me/known/restore', {
      method: 'POST',
      json: { filter: { lang: 'en', target: 'en' } },
    });
    expect(await byDirection.json()).toEqual({ restored: 2 });
    expect(await rows()).toEqual([`${b}:he`]);

    // Item ids alone (an older client) mean every direction of those items.
    await mark(cookie, everything);
    const byIds = await authed(cookie, '/me/known/restore', {
      method: 'POST',
      json: { itemIds: [b] },
    });
    expect(await byIds.json()).toEqual({ restored: 2 });
    expect(await rows()).toEqual([`${a}:en`, `${a}:he`]);
  });
});

describe('GET /api/me/known (FR-L60–63)', () => {
  it('shows the answer in the marked direction, topics and the round', async () => {
    const { cookie } = await signIn();
    await mark(cookie, [
      { itemId: await itemId('fx-word-2'), target: 'he', round: 2 },
      { itemId: await itemId('fx-word-1'), target: 'en', round: 1 },
    ]);
    const { items, total, nextCursor } = await list(cookie, '?sort=az');
    expect(total).toBe(2);
    expect(nextCursor).toBeNull();
    expect(items.map((i) => i.text)).toEqual(['fx-word-1', 'fx-word-2']);
    expect(items[0]).toMatchObject({
      knownTarget: 'en',
      knownInRound: 1,
      answer: { kind: 'explanation', lines: ['Explanation one'], numbered: false, dir: 'ltr' },
      topics: [{ name: 'Home' }],
    });
    expect(items[1]).toMatchObject({
      knownInRound: 2,
      answer: { kind: 'translation', lines: ['מילה-2א', 'מילה-2ב'], lang: 'he', dir: 'rtl' },
    });
  });

  it('searches text and translations, filters by language, type and topic', async () => {
    const { cookie } = await signIn();
    const texts = ['fx-word-1', 'fx-word-3', 'fx-expr-1', 'מילה-א'];
    for (const t of texts) {
      await mark(cookie, [
        { itemId: await itemId(t), target: t === 'מילה-א' ? 'en' : 'he', round: 1 },
      ]);
    }
    const names = async (q: string) => (await list(cookie, q)).items.map((i) => i.text).sort();
    expect(await names('?q=WORD-3')).toEqual(['fx-word-3']);
    expect(await names(`?q=${encodeURIComponent('ביטוי')}`)).toEqual(['fx-expr-1']);
    expect(await names('?q=fx-he')).toEqual(['מילה-א']); // its English translation
    expect(await names('?q=%25')).toEqual([]); // LIKE wildcards are literal
    expect(await names('?lang=he')).toEqual(['מילה-א']);
    expect(await names('?lang=en&target=he')).toEqual(['fx-expr-1', 'fx-word-1', 'fx-word-3']);
    expect(await names('?target=en')).toEqual(['מילה-א']);
    expect(await names(`?topicId=${await topicId('expressions')}`)).toEqual(['fx-expr-1']);
    expect(await names(`?topicId=${await topicId('nature')}`)).toEqual(['fx-word-3']);
    expect((await authed(cookie, '/me/known?sort=random')).status).toBe(400);
  });

  it('hides items in Trash and shows them again after a restore', async () => {
    const { cookie } = await signIn();
    const id = await itemId('fx-word-1');
    await mark(cookie, [{ itemId: id, target: 'he', round: 1 }]);
    await env.DB.prepare('UPDATE items SET deleted_at = ? WHERE id = ?').bind(Date.now(), id).run();
    expect((await list(cookie)).items).toHaveLength(0);
    await env.DB.prepare('UPDATE items SET deleted_at = NULL WHERE id = ?').bind(id).run();
    expect((await list(cookie)).items).toHaveLength(1);
  });

  it('paginates 50 at a time with a cursor, in every sort order', async () => {
    const { cookie, userId } = await signIn();
    // 60 synthetic items, each known in two directions at the same time: 120 rows whose ties are
    // broken by item id and target (D-028).
    const now = Date.now();
    const stmts = [];
    for (let i = 0; i < 60; i++) {
      const text = `bulk-${String(i).padStart(3, '0')}`;
      stmts.push(
        env.DB.prepare(
          `INSERT INTO items (lang, text, normalized_text, translation_parallel, created_at, updated_at)
           VALUES ('en', ?, ?, '{"he":["x"]}', ?, ?)`,
        ).bind(text, text, now, now),
      );
    }
    await env.DB.batch(stmts);
    await env.DB.prepare(
      `INSERT INTO user_known_items (user_id, item_id, known_target, known_in_round, known_at)
       SELECT ?, i.id, t.value, 1, ? + i.id FROM items AS i, json_each('["en","he"]') AS t
       WHERE i.text LIKE 'bulk-%'`,
    )
      .bind(userId, now)
      .run();

    for (const sort of ['newest', 'oldest', 'az'] as const) {
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const page: ListBody = await list(
          cookie,
          `?sort=${sort}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        );
        if (pages === 0) expect(page.total).toBe(120);
        else expect(page.total).toBeNull();
        seen.push(...page.items.map((i) => `${i.text}:${i.knownTarget}`));
        cursor = page.nextCursor;
        pages++;
      } while (cursor);
      expect(pages).toBe(3);
      expect(new Set(seen).size).toBe(120);
      const sorted = [...seen].sort();
      expect(seen).toEqual(sort === 'newest' ? sorted.reverse() : sorted);
    }
    expect((await authed(cookie, '/me/known?cursor=not-a-cursor')).status).toBe(400);
  });
});
