import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, authed, count, ORIGIN, seedFixtures, signIn } from './helpers';

let admin: { cookie: string; userId: string };

beforeEach(async () => {
  await seedFixtures();
  admin = await signIn('admin');
});

const HEADER =
  'lang,text,type,multiple_meanings,categories,translation_he,translation_en,explanation,synonyms,hints,status';

function upload(
  content: string | Uint8Array<ArrayBuffer>,
  query = '',
  cookie = admin.cookie,
  name = 'batch.csv',
): Promise<Response> {
  const form = new FormData();
  form.append('file', new File([content], name, { type: 'text/csv' }));
  return api(`/admin/import${query}`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: ORIGIN },
    body: form,
  });
}

type Report = {
  dryRun: boolean;
  committed: boolean;
  totals: { newItems: number; mergedItems: number; newCategories: number } | null;
  errors: { row: number; column: string; message: string }[];
  warnings: unknown[];
};

describe('GET /api/admin/import/template', () => {
  it('serves a UTF-8 (BOM) template for every language that imports cleanly', async () => {
    const res = await authed(admin.cookie, '/admin/import/template');
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
    expect(text.split(/\r?\n/)[0]).toContain(
      'translation_meaning_en,translation_meaning_he,translation_parallel_en,translation_parallel_he,translation_literal_en,translation_literal_he',
    );
    const report = await (await upload(bytes)).json<Report>();
    expect(report.errors).toEqual([]);
    expect(report.totals).toMatchObject({ newItems: 3, newLiteralEntries: 1 });
  });
});

describe('POST /api/admin/import', () => {
  const good = [HEADER, 'en,import-new,word,false,home,מילה-חדשה,,An explanation,,,published'].join(
    '\n',
  );

  it('a dry run reports totals and writes nothing', async () => {
    const before = await count('items');
    const report = await (await upload(good, '?dryRun=true')).json<Report>();
    expect(report).toMatchObject({ dryRun: true, committed: false, totals: { newItems: 1 } });
    expect(await count('items')).toBe(before);
    expect(await count('audit_log')).toBe(0);
  });

  it('commits with one csv.import audit entry (file name and hash, never the content)', async () => {
    const report = await (
      await upload(good, '?dryRun=false', admin.cookie, 'my-batch.csv')
    ).json<Report>();
    expect(report).toMatchObject({ committed: true, totals: { newItems: 1 } });
    const audit = await env.DB.prepare(
      'SELECT action, actor_user_id, details FROM audit_log',
    ).first<{
      action: string;
      actor_user_id: string;
      details: string;
    }>();
    expect(audit).toMatchObject({ action: 'csv.import', actor_user_id: admin.userId });
    expect(audit!.details).toContain('my-batch.csv');
    expect(audit!.details).toMatch(/[0-9a-f]{64}/);
    expect(audit!.details).not.toContain('import-new');
  });

  it('refuses to commit a file with row errors', async () => {
    const bad = [HEADER, 'en,bad-row,word,false,,,own-language,,,,published'].join('\n');
    const report = await (await upload(bad, '?dryRun=false')).json<Report>();
    expect(report.committed).toBe(false);
    expect(report.errors[0]).toMatchObject({ row: 2 });
    expect(await count('audit_log')).toBe(0);
  });

  it('creates missing categories only when asked', async () => {
    const csv = [HEADER, 'en,cat-row,word,false,brand-new,מילה,,,,,published'].join('\n');
    const refused = await (await upload(csv, '?dryRun=true')).json<Report>();
    expect(refused.errors.length).toBeGreaterThan(0);
    const ok = await (
      await upload(csv, '?dryRun=false&createMissingCategories=true')
    ).json<Report>();
    expect(ok).toMatchObject({ committed: true, totals: { newCategories: 1 } });
  });

  it('rejects non-UTF-8, missing and oversized files', async () => {
    const latin1 = new Uint8Array([...new TextEncoder().encode(`${HEADER}\nen,caf`), 0xe9, 0x0a]);
    const res = await upload(latin1);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { message: expect.stringContaining('UTF-8') as string },
    });

    const empty = await api('/admin/import', {
      method: 'POST',
      headers: { Cookie: admin.cookie, Origin: ORIGIN },
      body: new FormData(),
    });
    expect(empty.status).toBe(400);

    const big = new Uint8Array(2 * 1024 * 1024 + 10).fill(0x61);
    expect((await upload(big)).status).toBe(400);
    expect((await upload(good, '?dryRun=maybe')).status).toBe(400);
  });

  it('is admin-only and needs a multipart body', async () => {
    const learner = await signIn('user');
    expect((await upload(good, '', learner.cookie)).status).toBe(403);
    const json = await authed(admin.cookie, '/admin/import', { method: 'POST', json: {} });
    expect(json.status).toBe(400);
  });
});
