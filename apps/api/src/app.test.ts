import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { errorResponseSchema, healthResponseSchema } from '@myvocab/contracts';

const BASE = 'https://myvocab.test';

describe('GET /api/health', () => {
  it('returns ok and the app version', async () => {
    const res = await exports.default.fetch(`${BASE}/api/health`);
    expect(res.status).toBe(200);
    const body = healthResponseSchema.parse(await res.json());
    expect(body.ok).toBe(true);
  });

  it('marks every /api response as noindex and no-store', async () => {
    const res = await exports.default.fetch(`${BASE}/api/health`);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('unknown /api routes', () => {
  it('return a JSON 404 in the shared error shape', async () => {
    const res = await exports.default.fetch(`${BASE}/api/does-not-exist`);
    expect(res.status).toBe(404);
    expect(errorResponseSchema.parse(await res.json()).error.code).toBe('NOT_FOUND');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
