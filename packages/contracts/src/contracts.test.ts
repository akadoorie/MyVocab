import { describe, expect, it } from 'vitest';
import { errorResponseSchema, healthResponseSchema } from './index';

describe('contracts', () => {
  it('validates a health response', () => {
    expect(healthResponseSchema.parse({ ok: true, version: '0.0.0' })).toEqual({
      ok: true,
      version: '0.0.0',
    });
    expect(() => healthResponseSchema.parse({ ok: false, version: 'x' })).toThrow();
  });

  it('validates an error response and rejects unknown codes', () => {
    expect(
      errorResponseSchema.parse({ error: { code: 'NOT_FOUND', message: 'Not found' } }).error.code,
    ).toBe('NOT_FOUND');
    expect(() => errorResponseSchema.parse({ error: { code: 'NOPE', message: 'x' } })).toThrow();
  });
});
