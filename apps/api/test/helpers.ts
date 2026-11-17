import { env } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { vi } from 'vitest';
import { createContainer } from '../src/container';

export const BASE = 'https://myvocab.test';
export const ORIGIN = 'http://localhost:5173'; // APP_URL in wrangler.jsonc vars

// Synthetic content only (PRD §14.2).
export const FIXTURE_CSV = [
  'lang,text,type,multiple_meanings,categories,translation_he,translation_en,explanation,synonyms,hints,status',
  'en,fx-word-1,word,false,home,מילה-1,,Explanation one,,Hint one.,published',
  'en,fx-word-2,word,true,home,מילה-2א|מילה-2ב,,First meaning|Second meaning,syn-a,,published',
  'en,fx-word-3,word,false,nature,מילה-3,,,,,published',
  'en,fx-word-4,word,false,,,,Explanation four only,,,published',
  'en,fx-word-5,word,false,nature,מילה-5,,Explanation five,,,published',
  'en,fx-word-6,word,false,home,מילה-6,,Explanation six,,,published',
  'en,fx-word-7,word,false,,מילה-7,,Explanation seven,,,published',
  'en,fx-draft,word,false,home,מילה-טיוטה,,Draft explanation,,,draft',
  'en,fx-expr-1,expr,false,,ביטוי-1,,Expression explanation,,,published',
  'he,מילה-א,word,false,home,,fx-he-a,הסבר א,,,published',
].join('\n');

export async function seedFixtures() {
  const report = await createContainer(env.DB).csvImport.run({
    csvText: FIXTURE_CSV,
    fileName: 'fixtures.csv',
    dryRun: false,
    createMissingCategories: true,
    actor: null,
    limits: null,
  });
  if (!report.committed) throw new Error(JSON.stringify(report.errors));
  // The import writes one audit row; tests that count audit rows start from zero.
  await env.DB.prepare('DELETE FROM audit_log').run();
}

export async function setSetting(key: string, value: unknown) {
  await env.DB.prepare(
    'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  )
    .bind(key, JSON.stringify(value), Date.now())
    .run();
}

export async function count(table: string): Promise<number> {
  return (
    (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n ?? 0
  );
}

export async function categoryId(slug: string): Promise<number> {
  const row = await env.DB.prepare('SELECT id FROM categories WHERE slug = ?')
    .bind(slug)
    .first<{ id: number }>();
  if (!row) throw new Error(`No category ${slug}`);
  return row.id;
}

/** Mocks Turnstile siteverify (the Worker's outbound fetch runs in this isolate). */
export function mockTurnstile(success: boolean, hostname = 'example.com') {
  const real = globalThis.fetch;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://challenges.cloudflare.com/turnstile/')) {
      return Response.json({ success, hostname });
    }
    return real(input, init);
  });
}

export function api(path: string, init: RequestInit = {}) {
  return exports.default.fetch(`${BASE}/api${path}`, init);
}

export function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
  return api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers },
    body: JSON.stringify(body),
  });
}
