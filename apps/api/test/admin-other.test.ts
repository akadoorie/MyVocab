import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, authed, topicId, count, itemId, seedFixtures, signIn } from './helpers';

let admin: { cookie: string; userId: string };

beforeEach(async () => {
  await seedFixtures();
  admin = await signIn('admin');
});

const req = (path: string, init: Parameters<typeof authed>[2] = {}) =>
  authed(admin.cookie, path, init);
const actions = async () =>
  (await env.DB.prepare('SELECT action FROM audit_log ORDER BY id').all()).results.map(
    (r) => r.action,
  );

describe('topics (FR-A30)', () => {
  it('creates, renames, deactivates and reorders, each audited', async () => {
    const created = await req('/admin/topics', {
      method: 'POST',
      json: { slug: 'food-drink', name: 'Food & drink' },
    });
    expect(created.status).toBe(201);
    const cat = await created.json<{ id: number; sortOrder: number; itemCount: number }>();
    expect(cat).toMatchObject({ itemCount: 0, isActive: true });

    const renamed = await req(`/admin/topics/${cat.id}`, {
      method: 'PATCH',
      json: { name: 'Food', isActive: false },
    });
    expect(await renamed.json()).toMatchObject({ name: 'Food', isActive: false });
    const meta = await (await api('/meta')).json<{ topics: { slug: string }[] }>();
    expect(meta.topics.map((c) => c.slug)).not.toContain('food-drink');

    const home = await topicId('home');
    const order = await req('/admin/topics/order', {
      method: 'PUT',
      json: { ids: [cat.id, home] },
    });
    const list = await order.json<{ topics: { id: number }[] }>();
    expect(list.topics[0]?.id).toBe(cat.id);
    expect(await actions()).toEqual(['topic.create', 'topic.update', 'topic.reorder']);
  });

  it('validates slugs, refuses duplicates and blocks deleting a topic in use', async () => {
    const bad = await req('/admin/topics', {
      method: 'POST',
      json: { slug: 'Bad Slug', name: 'x' },
    });
    expect(bad.status).toBe(400);
    const dup = await req('/admin/topics', {
      method: 'POST',
      json: { slug: 'home', name: 'x' },
    });
    expect(dup.status).toBe(409);
    const home = await topicId('home');
    const inUse = await req(`/admin/topics/${home}`, { method: 'DELETE' });
    expect(inUse.status).toBe(409);
    expect(await inUse.json()).toMatchObject({ error: { details: { reason: 'in_use' } } });

    const empty = await (
      await req('/admin/topics', { method: 'POST', json: { slug: 'empty', name: 'Empty' } })
    ).json<{ id: number }>();
    expect((await req(`/admin/topics/${empty.id}`, { method: 'DELETE' })).status).toBe(200);
  });
});

describe('languages (FR-A35)', () => {
  it('deactivating hides a language; the last active one stays', async () => {
    const res = await req('/admin/languages/he', { method: 'PATCH', json: { isActive: false } });
    expect(res.status).toBe(200);
    const meta = await (await api('/meta')).json<{ languages: { code: string }[] }>();
    expect(meta.languages.map((l) => l.code)).toEqual(['en']);
    const last = await req('/admin/languages/en', { method: 'PATCH', json: { isActive: false } });
    expect(last.status).toBe(409);
    expect(
      (await req('/admin/languages/xx', { method: 'PATCH', json: { isActive: true } })).status,
    ).toBe(404);
    expect(await actions()).toEqual(['language.update']);
  });

  type Lang = { code: string; name: string; nativeName: string; isActive: boolean };
  const ARABIC = { code: 'ar', name: 'Arabic', nativeName: 'العربية', dir: 'rtl', script: 'Arab' };
  const addArabic = () => req('/admin/languages', { method: 'POST', json: ARABIC });
  const metaCodes = async () =>
    (await (await api('/meta')).json<{ languages: { code: string }[] }>()).languages.map(
      (l) => l.code,
    );

  it('adds a language inactive and last, audited; learners see it only once activated (D-027)', async () => {
    const res = await addArabic();
    expect(res.status).toBe(201);
    const { languages } = await res.json<{ languages: (Lang & { sortOrder: number })[] }>();
    expect(languages.map((l) => l.code)).toEqual(['en', 'he', 'ar']);
    expect(languages[2]).toMatchObject({ ...ARABIC, isActive: false, sortOrder: 3 });
    expect(await metaCodes()).toEqual(['en', 'he']);

    const on = await req('/admin/languages/ar', { method: 'PATCH', json: { isActive: true } });
    expect(on.status).toBe(200);
    expect(await metaCodes()).toEqual(['en', 'he', 'ar']);
    expect(await actions()).toEqual(['language.create', 'language.update']);
  });

  it('refuses a duplicate code, an unknown script and badly formed fields', async () => {
    expect((await addArabic()).status).toBe(201);
    const dup = await addArabic();
    expect(dup.status).toBe(409);
    expect(await dup.json()).toMatchObject({ error: { details: { reason: 'duplicate' } } });
    expect(
      (await req('/admin/languages', { method: 'POST', json: { ...ARABIC, code: 'he' } })).status,
    ).toBe(409);

    for (const bad of [
      { ...ARABIC, code: 'fr', script: 'Abcd' }, // well formed, but Unicode doesn't know it
      { ...ARABIC, code: 'fr', script: 'arab' },
      { ...ARABIC, code: 'FR' },
      { ...ARABIC, code: 'fr', name: '   ' },
      { ...ARABIC, code: 'fr', dir: 'up' },
      { ...ARABIC, code: 'fr', isActive: true }, // a new language always starts inactive
    ]) {
      expect((await req('/admin/languages', { method: 'POST', json: bad })).status).toBe(400);
    }
    expect(await actions()).toEqual(['language.create']);
  });

  it('renames a language; the code, direction and script cannot change', async () => {
    await addArabic();
    const res = await req('/admin/languages/ar', {
      method: 'PATCH',
      json: { name: 'Arabic (MSA)', nativeName: 'العربية الفصحى' },
    });
    const ar = (await res.json<{ languages: Lang[] }>()).languages.find((l) => l.code === 'ar');
    expect(ar).toMatchObject({ name: 'Arabic (MSA)', nativeName: 'العربية الفصحى' });
    for (const json of [{ dir: 'ltr' }, { script: 'Latn' }, { code: 'xx' }, {}]) {
      expect((await req('/admin/languages/ar', { method: 'PATCH', json })).status).toBe(400);
    }
  });

  it('an inactive language can be edited, imported and previewed, but stays hidden from learners', async () => {
    await addArabic();
    const id = await itemId('fx-word-1');
    type Item = {
      version: number;
      meaning: Record<string, string[]>;
      warnings: { message: string }[];
      playableTargets: string[];
    };
    const before = await (await req(`/admin/items/${id}`)).json<Item>();
    const patched = await req(`/admin/items/${id}`, {
      method: 'PATCH',
      json: { version: before.version, meaning: { ...before.meaning, ar: ['كَلِمَة'] } },
    });
    expect(patched.status).toBe(200);
    const item = await patched.json<Item>();
    expect(item.meaning.ar).toEqual(['كَلِمَة']);
    expect(item.playableTargets).toContain('ar');
    // "Not playable" warnings are about what learners see: none for an inactive language.
    expect(item.warnings.map((w) => w.message).join(' ')).not.toMatch(/Arabic/);

    const preview = await (
      await req(`/admin/items/${id}/preview`)
    ).json<{ direction: { target: string } }[]>();
    expect(preview.map((c) => c.direction.target)).toContain('ar');

    // A new item in the inactive language, and a CSV with its columns.
    const created = await req('/admin/items', {
      method: 'POST',
      json: { lang: 'ar', text: 'كلمة-تجربة', type: 'word', meaning: { en: ['test-word'] } },
    });
    expect(created.status).toBe(201);
    const csv = [
      'lang,text,type,translation_meaning_ar,translation_meaning_he',
      'en,ar-import-word,word,كلمة-مستوردة,מילה-מיובאת',
    ].join('\n');
    const form = new FormData();
    form.append('file', new File([csv], 'ar.csv', { type: 'text/csv' }));
    const report = await (
      await req('/admin/import?dryRun=true', { method: 'POST', body: form })
    ).json<{ errors: unknown[]; totals: { newItems: number } }>();
    expect(report.errors).toEqual([]);
    expect(report.totals.newItems).toBe(1);

    const template = await (await req('/admin/import/template')).text();
    expect(template.split(/\r?\n/)[0]).toContain('translation_meaning_ar');

    expect(await metaCodes()).toEqual(['en', 'he']);
  });

  it('still refuses translations into a language that does not exist', async () => {
    const id = await itemId('fx-word-1');
    const res = await req(`/admin/items/${id}`, {
      method: 'PATCH',
      json: { version: 1, meaning: { xx: ['nope'] } },
    });
    expect(res.status).toBe(400);
  });
});

describe('users (FR-A40–42)', () => {
  type UserBody = {
    users: { id: string; role: string; isOwner: boolean; lastSeenAt: number | null }[];
  };

  it('lists users with owner badge and last seen; searches by name or email', async () => {
    await signIn('user', 'learner@example.test');
    await signIn('user', 'owner@example.test');
    const all = await (await req('/admin/users')).json<UserBody>();
    expect(all.users).toHaveLength(3);
    expect(all.users.find((u) => u.isOwner)?.role).toBe('admin');
    expect(all.users.every((u) => typeof u.lastSeenAt === 'number')).toBe(true);
    const found = await (await req('/admin/users?q=LEARNER')).json<UserBody>();
    expect(found.users).toHaveLength(1);
  });

  it('promotes and demotes with audit; owners, self and the last admin are protected', async () => {
    const learner = await signIn('user', 'learner@example.test');
    const promote = await req(`/admin/users/${learner.userId}`, {
      method: 'PATCH',
      json: { role: 'admin' },
    });
    expect(await promote.json()).toMatchObject({ role: 'admin' });
    const demote = await req(`/admin/users/${learner.userId}`, {
      method: 'PATCH',
      json: { role: 'user' },
    });
    expect(await demote.json()).toMatchObject({ role: 'user' });

    const self = await req(`/admin/users/${admin.userId}`, {
      method: 'PATCH',
      json: { role: 'user' },
    });
    expect(self.status).toBe(409);
    const owner = await signIn('user', 'owner@example.test'); // promoted on sign-in
    const demoteOwner = await req(`/admin/users/${owner.userId}`, {
      method: 'PATCH',
      json: { role: 'user' },
    });
    expect(demoteOwner.status).toBe(409);
    const banOwner = await req(`/admin/users/${owner.userId}`, {
      method: 'PATCH',
      json: { banned: true },
    });
    expect(banOwner.status).toBe(409);
    expect(
      (await req(`/admin/users/${admin.userId}`, { method: 'PATCH', json: { banned: true } }))
        .status,
    ).toBe(409);
    expect(await actions()).toEqual(['user.role_change', 'user.role_change']);
  });

  it('the last admin cannot be demoted by another path', async () => {
    // Two admins: the second demotes the first, then nobody can demote the remaining one.
    const second = await signIn('admin', 'second@example.test');
    const res = await authed(second.cookie, `/admin/users/${admin.userId}`, {
      method: 'PATCH',
      json: { role: 'user' },
    });
    expect(res.status).toBe(200);
    expect(await count('"user" WHERE role = \'admin\'')).toBe(1);
  });

  it('banning revokes every session; unbanning restores access to sign in', async () => {
    const learner = await signIn('user', 'learner@example.test');
    const ban = await req(`/admin/users/${learner.userId}`, {
      method: 'PATCH',
      json: { banned: true, banReason: 'Scraping' },
    });
    expect(await ban.json()).toMatchObject({ banned: true, banReason: 'Scraping' });
    const sessions = await env.DB.prepare('SELECT COUNT(*) AS n FROM session WHERE user_id = ?')
      .bind(learner.userId)
      .first<{ n: number }>();
    expect(sessions?.n).toBe(0);
    expect((await (await authed(learner.cookie, '/me')).json<{ user: unknown }>()).user).toBeNull();
    const unban = await req(`/admin/users/${learner.userId}`, {
      method: 'PATCH',
      json: { banned: false },
    });
    expect(await unban.json()).toMatchObject({ banned: false, banReason: null });
    expect(await actions()).toEqual(['user.ban', 'user.unban']);
    expect(
      (await req(`/admin/users/${learner.userId}`, { method: 'PATCH', json: {} })).status,
    ).toBe(400);
  });
});

describe('settings (FR-A50)', () => {
  it('validates the merged settings and audits only changed keys', async () => {
    const bad = [
      { 'loop.defaultSize': 15 },
      { 'defaults.sourceLang': 'fr' },
      { 'loop.sizeOptions': [10, 100] },
      { 'defaults.topicId': 9999 },
      { 'undo.windowSeconds': 99 },
      { unknown: 1 },
    ];
    for (const json of bad) {
      expect(
        (await req('/admin/settings', { method: 'PUT', json })).status,
        JSON.stringify(json),
      ).toBe(400);
    }
    const res = await req('/admin/settings', {
      method: 'PUT',
      json: { 'loop.sizeOptions': [20, 10], 'undo.windowSeconds': 6, 'guests.enabled': true },
    });
    expect(await res.json()).toMatchObject({
      'loop.sizeOptions': [10, 20],
      'undo.windowSeconds': 6,
    });
    const meta = await (
      await api('/meta')
    ).json<{ sizeOptions: number[]; undoWindowSeconds: number }>();
    expect(meta).toMatchObject({ sizeOptions: [10, 20], undoWindowSeconds: 6 });
    const audit = await env.DB.prepare('SELECT details FROM audit_log').first<{
      details: string;
    }>();
    expect(Object.keys(JSON.parse(audit!.details).changes).sort()).toEqual([
      'loop.sizeOptions',
      'undo.windowSeconds',
    ]);
  });
});

describe('audit log (FR-A70–71) and dashboard (FR-A1)', () => {
  it('lists entries newest first with filters and a cursor; nothing can change them', async () => {
    for (let i = 0; i < 3; i++) {
      await req('/admin/topics', { method: 'POST', json: { slug: `c-${i}`, name: `C ${i}` } });
    }
    await req('/admin/languages/he', { method: 'PATCH', json: { isActive: false } });
    type Page = { entries: { id: number; action: string }[]; nextCursor: number | null };
    const all = await (await req('/admin/audit')).json<Page>();
    expect(all.entries.map((e) => e.action)).toEqual([
      'language.update',
      'topic.create',
      'topic.create',
      'topic.create',
    ]);
    const cats = await (await req('/admin/audit?action=topic.')).json<Page>();
    expect(cats.entries).toHaveLength(3);
    const byType = await (await req('/admin/audit?entityType=language')).json<Page>();
    expect(byType.entries).toHaveLength(1);
    const byActor = await (await req(`/admin/audit?actor=${admin.userId}`)).json<Page>();
    expect(byActor.entries).toHaveLength(4);
    const older = await (await req(`/admin/audit?cursor=${all.entries[1]!.id}`)).json<Page>();
    expect(older.entries).toHaveLength(2);
    for (const method of ['POST', 'PATCH', 'DELETE', 'PUT']) {
      expect((await req('/admin/audit', { method, json: {} })).status).toBe(404);
    }
  });

  it('counts items, gaps, users, trash and limit events', async () => {
    const stats = await (
      await req('/admin/stats')
    ).json<{
      items: {
        total: number;
        drafts: number;
        missingTranslation: Record<string, number>;
        noExplanation: number;
        multipleMeanings: number;
      };
      users: { total: number; admins: number };
      trash: number;
    }>();
    expect(stats.items).toMatchObject({
      total: 10,
      drafts: 1,
      noExplanation: 1,
      multipleMeanings: 1,
    });
    // fx-word-4 has no Hebrew translation; the Hebrew item has its English one.
    expect(stats.items.missingTranslation).toEqual({ en: 0, he: 1 });
    expect(stats.users).toEqual({ total: 1, admins: 1 });
    expect(stats.trash).toBe(0);
  });
});
