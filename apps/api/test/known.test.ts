import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, authed, categoryId, count, itemId, postJson, seedFixtures, signIn } from './helpers';

type ListBody = {
  items: {
    itemId: number;
    text: string;
    knownTarget: string;
    knownInCycle: number;
    knownAt: number;
    answer: { kind: string; lines: string[]; numbered: boolean; lang: string; dir: string };
    categories: { id: number; name: string }[];
  }[];
  nextCursor: string | null;
  total: number | null;
};

async function mark(cookie: string, items: { itemId: number; target: string; cycle: number }[]) {
  return authed(cookie, '/me/known', { method: 'POST', json: { items } });
}

async function list(cookie: string, query = ''): Promise<ListBody> {
  const res = await authed(cookie, `/me/known${query}`);
  expect(res.status).toBe(200);
  return res.json<ListBody>();
}

async function available(cookie: string, source: string, target: string) {
  const res = await authed(cookie, `/loops/available?source=${source}&target=${target}&type=word`);
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
  it('is an idempotent upsert that keeps the first mark', async () => {
    const { cookie } = await signIn();
    const id = await itemId('fx-word-1');
    const first = await mark(cookie, [{ itemId: id, target: 'he', cycle: 1 }]);
    expect(await first.json()).toEqual({ saved: 1 });
    const before = await list(cookie);
    const again = await mark(cookie, [{ itemId: id, target: 'en', cycle: 3 }]);
    expect(await again.json()).toEqual({ saved: 0 });
    const after = await list(cookie);
    expect(after.items[0]).toMatchObject({ knownTarget: 'he', knownInCycle: 1 });
    expect(after.items[0]?.knownAt).toBe(before.items[0]?.knownAt);
  });

  it('skips missing and trashed items and duplicates within a batch', async () => {
    const { cookie } = await signIn();
    const a = await itemId('fx-word-1');
    const b = await itemId('fx-word-3');
    await env.DB.prepare('UPDATE items SET deleted_at = ? WHERE id = ?').bind(Date.now(), b).run();
    const res = await mark(cookie, [
      { itemId: a, target: 'he', cycle: 1 },
      { itemId: a, target: 'he', cycle: 2 },
      { itemId: b, target: 'he', cycle: 1 },
      { itemId: 999_999, target: 'he', cycle: 1 },
    ]);
    expect(await res.json()).toEqual({ saved: 1 });
    expect(await count('user_known_items')).toBe(1);
  });

  it('validates the batch strictly', async () => {
    const { cookie } = await signIn();
    const one = { itemId: 1, target: 'he', cycle: 1 };
    for (const json of [
      { items: [] },
      { items: Array.from({ length: 101 }, (_, i) => ({ ...one, itemId: i + 1 })) },
      { items: [{ ...one, cycle: 0 }] },
      { items: [{ ...one, userId: 'someone-else' }] },
      { items: [one], userId: 'someone-else' },
    ]) {
      expect((await authed(cookie, '/me/known', { method: 'POST', json })).status).toBe(400);
    }
  });

  it('hides a known item in every direction, not other items (FR-L54)', async () => {
    const { cookie } = await signIn();
    const enEn = await available(cookie, 'en', 'en');
    const enHe = await available(cookie, 'en', 'he');
    const heEn = await available(cookie, 'he', 'en');
    await mark(cookie, [{ itemId: await itemId('fx-word-1'), target: 'he', cycle: 1 }]);
    expect(await available(cookie, 'en', 'he')).toBe(enHe - 1);
    expect(await available(cookie, 'en', 'en')).toBe(enEn - 1);
    expect(await available(cookie, 'he', 'en')).toBe(heEn);
    // A guest's counts are not affected.
    const guest = await api('/loops/available?source=en&target=he&type=word');
    expect((await guest.json<{ available: number }>()).available).toBe(enHe);
  });
});

describe('DELETE /api/me/known/:itemId and restore', () => {
  it('removes one known item (undo / return to loops)', async () => {
    const { cookie } = await signIn();
    const id = await itemId('fx-word-1');
    await mark(cookie, [{ itemId: id, target: 'he', cycle: 1 }]);
    const res = await authed(cookie, `/me/known/${id}`, { method: 'DELETE' });
    expect(await res.json()).toEqual({ removed: 1 });
    expect(await count('user_known_items')).toBe(0);
    expect((await authed(cookie, '/me/known/abc', { method: 'DELETE' })).status).toBe(400);
  });

  it("user A can't read or change user B's known items", async () => {
    const a = await signIn('user', 'a@example.test');
    const b = await signIn('user', 'b@example.test');
    const id = await itemId('fx-word-1');
    await mark(a.cookie, [{ itemId: id, target: 'he', cycle: 1 }]);
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
      ids.map((id) => ({ itemId: id, target: 'he', cycle: 1 })),
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
      json: { filter: { type: 'word' } },
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
});

describe('GET /api/me/known (FR-L60–63)', () => {
  it('shows the answer in the marked direction, categories and the cycle', async () => {
    const { cookie } = await signIn();
    await mark(cookie, [
      { itemId: await itemId('fx-word-2'), target: 'he', cycle: 2 },
      { itemId: await itemId('fx-word-1'), target: 'en', cycle: 1 },
    ]);
    const { items, total, nextCursor } = await list(cookie, '?sort=az');
    expect(total).toBe(2);
    expect(nextCursor).toBeNull();
    expect(items.map((i) => i.text)).toEqual(['fx-word-1', 'fx-word-2']);
    expect(items[0]).toMatchObject({
      knownTarget: 'en',
      knownInCycle: 1,
      answer: { kind: 'explanation', lines: ['Explanation one'], numbered: false, dir: 'ltr' },
      categories: [{ name: 'Home' }],
    });
    expect(items[1]).toMatchObject({
      knownInCycle: 2,
      answer: { kind: 'translation', lines: ['מילה-2א', 'מילה-2ב'], lang: 'he', dir: 'rtl' },
    });
  });

  it('searches text and translations, filters by language, type and category', async () => {
    const { cookie } = await signIn();
    const texts = ['fx-word-1', 'fx-word-3', 'fx-expr-1', 'מילה-א'];
    for (const t of texts) {
      await mark(cookie, [
        { itemId: await itemId(t), target: t === 'מילה-א' ? 'en' : 'he', cycle: 1 },
      ]);
    }
    const names = async (q: string) => (await list(cookie, q)).items.map((i) => i.text).sort();
    expect(await names('?q=WORD-3')).toEqual(['fx-word-3']);
    expect(await names(`?q=${encodeURIComponent('ביטוי')}`)).toEqual(['fx-expr-1']);
    expect(await names('?q=fx-he')).toEqual(['מילה-א']); // its English translation
    expect(await names('?q=%25')).toEqual([]); // LIKE wildcards are literal
    expect(await names('?lang=he')).toEqual(['מילה-א']);
    expect(await names('?type=expr')).toEqual(['fx-expr-1']);
    expect(await names(`?categoryId=${await categoryId('nature')}`)).toEqual(['fx-word-3']);
    expect((await authed(cookie, '/me/known?sort=random')).status).toBe(400);
  });

  it('hides items in Trash and shows them again after a restore', async () => {
    const { cookie } = await signIn();
    const id = await itemId('fx-word-1');
    await mark(cookie, [{ itemId: id, target: 'he', cycle: 1 }]);
    await env.DB.prepare('UPDATE items SET deleted_at = ? WHERE id = ?').bind(Date.now(), id).run();
    expect((await list(cookie)).items).toHaveLength(0);
    await env.DB.prepare('UPDATE items SET deleted_at = NULL WHERE id = ?').bind(id).run();
    expect((await list(cookie)).items).toHaveLength(1);
  });

  it('paginates 50 at a time with a cursor, in every sort order', async () => {
    const { cookie, userId } = await signIn();
    // 120 synthetic items, known at distinct times.
    const now = Date.now();
    const stmts = [];
    for (let i = 0; i < 120; i++) {
      const text = `bulk-${String(i).padStart(3, '0')}`;
      stmts.push(
        env.DB.prepare(
          `INSERT INTO items (lang, text, normalized_text, type, translation_parallel, created_at, updated_at)
           VALUES ('en', ?, ?, 'word', '{"he":["x"]}', ?, ?)`,
        ).bind(text, text, now, now),
      );
    }
    await env.DB.batch(stmts);
    await env.DB.prepare(
      `INSERT INTO user_known_items (user_id, item_id, known_target, known_in_cycle, known_at)
       SELECT ?, id, 'he', 1, ? + id FROM items WHERE text LIKE 'bulk-%'`,
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
        seen.push(...page.items.map((i) => i.text));
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
