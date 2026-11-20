import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { createContainer } from '../src/container';
import { authed, topicId, count, itemId, seedFixtures, setSetting, signIn } from './helpers';

let admin: { cookie: string; userId: string };

beforeEach(async () => {
  await seedFixtures();
  admin = await signIn('admin');
});

type Item = {
  itemId: number;
  version: number;
  text: string;
  topicIds: number[];
  parallel: Record<string, string[]>;
  explanation: string[];
  hints: string[];
  warnings: { code: string; path: string }[];
  playableTargets: string[];
};

const req = (path: string, init: Parameters<typeof authed>[2] = {}) =>
  authed(admin.cookie, path, init);
const create = (json: unknown) => req('/admin/items', { method: 'POST', json });
const patch = (id: number, json: unknown) => req(`/admin/items/${id}`, { method: 'PATCH', json });
const getItem = async (id: number) => (await req(`/admin/items/${id}`)).json<Item>();
const auditActions = async () =>
  (await env.DB.prepare('SELECT action FROM audit_log ORDER BY id').all()).results.map(
    (r) => r.action,
  );

describe('POST /api/admin/items', () => {
  it('creates an item with topics, warnings and an audit entry', async () => {
    const home = await topicId('home');
    const res = await create({
      lang: 'en',
      text: '  new-sample  ',
      type: 'word',
      multipleMeanings: true,
      topicIds: [home],
      meaning: { he: ['מילה-חדשה'] },
      hints: ['A synthetic hint.'],
    });
    expect(res.status).toBe(201);
    const item = await res.json<Item>();
    expect(item).toMatchObject({
      text: 'new-sample',
      version: 1,
      topicIds: [home],
      playableTargets: ['he'],
    });
    expect(item.warnings.map((w) => w.code).sort()).toEqual([
      'MULTIPLE_MEANINGS_SINGLE_ENTRY',
      'NOT_PLAYABLE',
    ]);
    expect(await auditActions()).toEqual(['item.create']);
    const audit = await env.DB.prepare('SELECT entity_id, actor_user_id FROM audit_log').first();
    expect(audit).toEqual({ entity_id: String(item.itemId), actor_user_id: admin.userId });
  });

  it('rejects same-language translations, unknown topics and duplicates', async () => {
    const base = { lang: 'en', text: 'another', type: 'word' };
    expect((await create({ ...base, parallel: { en: ['x'] } })).status).toBe(400);
    expect((await create({ ...base, topicIds: [9999] })).status).toBe(400);
    expect((await create({ ...base, text: 'x'.repeat(201) })).status).toBe(400);
    const dup = await create({ ...base, text: 'FX-WORD-1' });
    expect(dup.status).toBe(409);
    expect(await dup.json()).toMatchObject({ error: { details: { reason: 'duplicate' } } });
    expect(await auditActions()).toEqual([]);
  });

  it('flags mixed scripts', async () => {
    const res = await create({
      lang: 'en',
      text: 'mixed-מ-text',
      type: 'word',
      explanation: ['x'],
    });
    const item = await res.json<Item>();
    expect(item.warnings.some((w) => w.code === 'MIXED_SCRIPT' && w.path === 'text')).toBe(true);
  });
});

describe('PATCH /api/admin/items/:id (optimistic concurrency)', () => {
  it('replaces a list, bumps the version and audits the list before and after', async () => {
    const id = await itemId('fx-word-1');
    const res = await patch(id, { version: 1, hints: ['Hint one.', 'Hint two.'] });
    expect(res.status).toBe(200);
    expect(await res.json<Item>()).toMatchObject({ version: 2, hints: ['Hint one.', 'Hint two.'] });
    const audit = await env.DB.prepare('SELECT action, details FROM audit_log').first<{
      action: string;
      details: string;
    }>();
    expect(audit?.action).toBe('item.update');
    expect(JSON.parse(audit!.details)).toEqual({
      changes: { hints: { before: ['Hint one.'], after: ['Hint one.', 'Hint two.'] } },
    });
  });

  it('sets and clears a literal meaning per language', async () => {
    const id = await itemId('fx-word-1');
    const set = await patch(id, { version: 1, literal: { he: ['מילולי'] } });
    expect(set.status).toBe(200);
    expect(await set.json<Item>()).toMatchObject({ version: 2, literal: { he: ['מילולי'] } });
    const cleared = await patch(id, { version: 2, literal: {} });
    expect(await cleared.json<Item>()).toMatchObject({ version: 3, literal: {} });
  });

  it('stores the "same as the parallel" literal marker, only next to a parallel (D-026)', async () => {
    const res = await create({
      lang: 'en',
      text: 'marker-sample',
      type: 'expr',
      meaning: { he: ['משמעות'] },
      parallel: { he: ['מקבילה'] },
      literal: { he: ['=parallel'] },
    });
    expect(res.status).toBe(201);
    const item = await res.json<Item & { literal: Record<string, string[]> }>();
    expect(item.literal).toEqual({ he: ['=parallel'] });
    // The literal counts as filled in: no missing-literal warning.
    expect(item.warnings.map((w) => w.code)).not.toContain('MISSING_LITERAL');
    const row = await env.DB.prepare('SELECT translation_literal AS l FROM items WHERE id = ?')
      .bind(item.itemId)
      .first<{ l: string }>();
    expect(row?.l).toBe('{"he":["=parallel"]}');
    // The card shows the flag, never the marker as text.
    const cards = await (
      await req(`/admin/items/${item.itemId}/preview`)
    ).json<
      {
        direction: { target: string };
        answer: { literal: string[]; literalSameAsParallel: boolean };
      }[]
    >();
    expect(cards.find((c) => c.direction.target === 'he')?.answer).toMatchObject({
      literal: [],
      literalSameAsParallel: true,
    });
    // Removing the parallel while the marker stays is refused.
    const bad = await patch(item.itemId, { version: 1, parallel: {} });
    expect(bad.status).toBe(400);
  });

  it('a stale version gets 409 and writes nothing, even after another edit bumped the version', async () => {
    const id = await itemId('fx-word-1');
    const nature = await topicId('nature');
    // Someone else's edit: version 1 → 2.
    expect((await patch(id, { version: 1, explanation: ['Changed elsewhere'] })).status).toBe(200);
    await env.DB.prepare('DELETE FROM audit_log').run();
    const stale = await patch(id, { version: 1, topicIds: [nature], hints: ['Mine'] });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: { details: { reason: 'stale' } } });
    const item = await getItem(id);
    expect(item).toMatchObject({ version: 2, hints: ['Hint one.'] });
    expect(item.topicIds).toEqual([await topicId('home')]);
    expect(await count('audit_log')).toBe(0);
  });

  it('the repository refuses a stale version inside the batch (race after the read)', async () => {
    const id = await itemId('fx-word-1');
    const nature = await topicId('nature');
    // Simulate a concurrent edit between the service's read and its write.
    await env.DB.prepare('UPDATE items SET version = 2 WHERE id = ?').bind(id).run();
    const { D1AdminItemRepository } = await import('../src/repositories/d1/admin-items');
    const { createDb } = await import('../src/db/client');
    const repo = new D1AdminItemRepository(createDb(env.DB), env.DB);
    const applied = await repo.update(
      id,
      1,
      { hints: ['Mine'] },
      [nature],
      { userId: admin.userId, email: 'a@x' },
      { action: 'item.update', details: {} },
      Date.now(),
    );
    expect(applied).toBe(false);
    expect(await count('audit_log')).toBe(0);
    const links = await env.DB.prepare('SELECT topic_id FROM item_topics WHERE item_id = ?')
      .bind(id)
      .all();
    expect(links.results.map((r) => r.topic_id)).toEqual([await topicId('home')]);
  });

  it('never accepts lang, validates the merged item and refuses duplicates', async () => {
    const id = await itemId('fx-word-1');
    expect((await patch(id, { version: 1, lang: 'he' })).status).toBe(400);
    expect((await patch(id, { version: 1, parallel: { en: ['x'] } })).status).toBe(400);
    expect((await patch(id, { version: 1, literal: { en: ['x'] } })).status).toBe(400);
    expect((await patch(id, { version: 1, hints: ['a', 'A'] })).status).toBe(400);
    expect((await patch(id, { version: 1, text: 'fx-word-2' })).status).toBe(409);
    expect(await count('audit_log')).toBe(0);
  });

  it('a patch that changes nothing writes nothing', async () => {
    const id = await itemId('fx-word-1');
    const res = await patch(id, { version: 1, hints: [' Hint one. '] });
    expect(await res.json<Item>()).toMatchObject({ version: 1 });
    expect(await count('audit_log')).toBe(0);
  });

  it('changes topics and status', async () => {
    const id = await itemId('fx-word-1');
    const nature = await topicId('nature');
    const res = await patch(id, { version: 1, topicIds: [nature], status: 'draft' });
    expect(await res.json()).toMatchObject({ topicIds: [nature], status: 'draft', version: 2 });
  });
});

describe('GET /api/admin/items and preview', () => {
  it('filters and paginates', async () => {
    const list = async (q: string) =>
      (
        await (await req(`/admin/items${q}`)).json<{ items: { text: string }[]; total: number }>()
      ).items
        .map((i) => i.text)
        .sort();
    expect((await (await req('/admin/items')).json<{ total: number }>()).total).toBe(10);
    expect(await list('?missingTranslation=he&lang=en')).toEqual(['fx-word-4']);
    expect(await list('?missingExplanation=true')).toEqual(['fx-word-3']);
    expect(await list('?status=draft')).toEqual(['fx-draft']);
    expect(await list('?type=expr')).toEqual(['fx-expr-1']);
    expect(await list('?multipleMeanings=true')).toEqual(['fx-word-2']);
    expect(await list('?q=word-7')).toEqual(['fx-word-7']);
    expect((await req('/admin/items?page=0')).status).toBe(400);
  });

  it('lists items that are playable in no direction', async () => {
    await create({ lang: 'en', text: 'orphan', type: 'word', hints: ['only a hint'] });
    const res = await req('/admin/items?notPlayable=true');
    const body = await res.json<{ items: { text: string }[] }>();
    expect(body.items.map((i) => i.text)).toEqual(['orphan']);
  });

  it('previews the card of every playable direction with the loop card builder', async () => {
    const id = await itemId('fx-word-2');
    const cards = await (
      await req(`/admin/items/${id}/preview`)
    ).json<{ direction: { target: string }; answer: { kind: string; numbered: boolean } }[]>();
    expect(cards.map((c) => [c.direction.target, c.answer.kind, c.answer.numbered])).toEqual([
      ['en', 'explanation', true],
      ['he', 'translation', false],
    ]);
  });
});

describe('Trash (FR-A20–24)', () => {
  async function markKnown(cookie: string, id: number) {
    await authed(cookie, '/me/known', {
      method: 'POST',
      json: { items: [{ itemId: id, target: 'he', cycle: 1 }] },
    });
  }

  it('delete hides an item from loops and known lists; restore brings the known mark back', async () => {
    const learner = await signIn('user');
    const id = await itemId('fx-word-1');
    await markKnown(learner.cookie, id);
    const before = await (await req('/loops/available?source=en&target=he&type=word')).json();

    expect((await req(`/admin/items/${id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await req(`/admin/items/${id}`)).status).toBe(404);
    const known = await (await authed(learner.cookie, '/me/known')).json<{ items: unknown[] }>();
    expect(known.items).toHaveLength(0);
    const after = await (await req('/loops/available?source=en&target=he&type=word')).json();
    expect(after).toEqual({ available: (before as { available: number }).available - 1 });

    const trash = await (
      await req('/admin/trash')
    ).json<{
      items: { itemId: number; deletedBy: { id: string }; purgeAt: number; deletedAt: number }[];
      retentionHours: number;
    }>();
    expect(trash.items[0]).toMatchObject({ itemId: id, deletedBy: { id: admin.userId } });
    expect(trash.items[0]!.purgeAt - trash.items[0]!.deletedAt).toBe(24 * 3600_000);

    expect((await req(`/admin/trash/${id}/restore`, { method: 'POST', json: {} })).status).toBe(
      200,
    );
    const restored = await (await authed(learner.cookie, '/me/known')).json<{ items: unknown[] }>();
    expect(restored.items).toHaveLength(1);
    expect(await auditActions()).toEqual(['item.trash', 'item.restore']);
    const snapshot = await env.DB.prepare(
      "SELECT details FROM audit_log WHERE action = 'item.trash'",
    ).first<{ details: string }>();
    expect(JSON.parse(snapshot!.details).snapshot).toMatchObject({
      itemId: id,
      text: 'fx-word-1',
      topics: ['home'],
      meaning: { he: ['מילה-1'] },
    });
  });

  it('restore is blocked while a non-deleted duplicate exists', async () => {
    const id = await itemId('fx-word-1');
    await req(`/admin/items/${id}`, { method: 'DELETE' });
    expect(
      (await create({ lang: 'en', text: 'fx-word-1', type: 'word', explanation: ['x'] })).status,
    ).toBe(201);
    const res = await req(`/admin/trash/${id}/restore`, { method: 'POST', json: {} });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { details: { reason: 'duplicate' } } });
  });

  it('purge needs the typed confirmation, cascades and keeps a snapshot', async () => {
    const learner = await signIn('user');
    const id = await itemId('fx-word-1');
    await markKnown(learner.cookie, id);
    await req(`/admin/items/${id}`, { method: 'DELETE' });
    expect((await req(`/admin/trash/${id}`, { method: 'DELETE', json: {} })).status).toBe(400);
    expect(
      (await req(`/admin/trash/${id}`, { method: 'DELETE', json: { confirm: 'PURGE' } })).status,
    ).toBe(200);
    expect(await count('user_known_items')).toBe(0);
    const links = await env.DB.prepare('SELECT COUNT(*) AS n FROM item_topics WHERE item_id = ?')
      .bind(id)
      .first<{ n: number }>();
    expect(links?.n).toBe(0);
    expect(await auditActions()).toEqual(['item.trash', 'item.purge']);
    // Purging a live item is not possible.
    const live = await itemId('fx-word-2');
    expect(
      (await req(`/admin/trash/${live}`, { method: 'DELETE', json: { confirm: 'PURGE' } })).status,
    ).toBe(404);
  });

  it('the hourly cron purges only items older than the retention, with snapshots', async () => {
    await setSetting('trash.retentionHours', 2);
    const old = await itemId('fx-word-1');
    const recent = await itemId('fx-word-2');
    await req(`/admin/items/${old}`, { method: 'DELETE' });
    await req(`/admin/items/${recent}`, { method: 'DELETE' });
    await env.DB.prepare('UPDATE items SET deleted_at = ? WHERE id = ?')
      .bind(Date.now() - 3 * 3600_000, old)
      .run();
    // Old usage counters go too; recent ones stay.
    await env.DB.prepare(
      "INSERT INTO usage_counters (subject, period, count, updated_at) VALUES ('ip:x', 'h:2000-01-01T00', 1, 0), ('user:y', 'd:2000-01-01', 5, 0), ('ip:z', ?, 1, 0)",
    )
      .bind(`h:${new Date().toISOString().slice(0, 13)}`)
      .run();

    const result = await createContainer(env.DB, {
      TURNSTILE_SECRET_KEY: 'x',
      turnstileHostname: null,
      ownerEmails: new Set(),
    }).maintenance.hourly();
    expect(result).toMatchObject({ purged: 1, usageRows: 2 });
    expect(await env.DB.prepare('SELECT id FROM items WHERE id = ?').bind(old).first()).toBeNull();
    expect(
      await env.DB.prepare('SELECT id FROM items WHERE id = ?').bind(recent).first(),
    ).not.toBeNull();
    const purge = await env.DB.prepare(
      "SELECT actor_user_id, details FROM audit_log WHERE action = 'item.purge'",
    ).first<{ actor_user_id: string | null; details: string }>();
    expect(purge?.actor_user_id).toBeNull();
    expect(JSON.parse(purge!.details)).toMatchObject({ auto: true, snapshot: { itemId: old } });
    expect(await count('usage_counters')).toBe(1);
  });
});

describe('the sample set on items (D-038)', () => {
  const sampleOf = async (id: number) =>
    (await req(`/admin/items/${id}`)).json<{ inSampleSet: boolean; version: number }>();

  it('a new item starts outside the sample set unless ticked', async () => {
    const off = await (
      await create({ lang: 'en', text: 'fx-new-off', type: 'word', explanation: ['x'] })
    ).json<{ inSampleSet: boolean }>();
    expect(off.inSampleSet).toBe(false);
    const on = await (
      await create({
        lang: 'en',
        text: 'fx-new-on',
        type: 'word',
        explanation: ['x'],
        inSampleSet: true,
      })
    ).json<{ inSampleSet: boolean }>();
    expect(on.inSampleSet).toBe(true);
  });

  it('a patch switches it and audits the change', async () => {
    const id = await itemId('fx-word-1');
    const before = await sampleOf(id);
    expect(before.inSampleSet).toBe(true);
    const res = await patch(id, { version: before.version, inSampleSet: false });
    expect(res.status).toBe(200);
    expect((await sampleOf(id)).inSampleSet).toBe(false);
    const details = await env.DB.prepare(
      `SELECT details FROM audit_log WHERE action = 'item.update'`,
    ).first<{ details: string }>();
    expect(JSON.parse(details?.details ?? '{}')).toMatchObject({
      changes: { inSampleSet: { before: true, after: false } },
    });
  });

  it('the list filters by it and shows it on each row', async () => {
    await env.DB.prepare(`UPDATE items SET in_sample_set = 0 WHERE text = 'fx-word-1'`).run();
    const list = async (q: string) =>
      (await req(`/admin/items?${q}`)).json<{
        total: number;
        items: { text: string; inSampleSet: boolean }[];
      }>();
    const out = await list('inSampleSet=false');
    expect(out.items.map((i) => i.text)).toEqual(['fx-word-1']);
    expect(out.items[0]?.inSampleSet).toBe(false);
    expect((await list('inSampleSet=true')).total).toBe(9);
  });

  it('the dashboard counts it, and what guests can play per direction', async () => {
    const stats = await (
      await req('/admin/stats')
    ).json<{
      items: {
        sampleSet: number;
        sampleByDirection: { source: string; target: string; type: string; count: number }[];
      };
    }>();
    expect(stats.items.sampleSet).toBe(10);
    // Published with an answer in that direction: the draft and fx-word-4 (en → he) don't count.
    expect(stats.items.sampleByDirection).toContainEqual({
      source: 'en',
      target: 'he',
      type: 'word',
      count: 6,
    });
  });
});
