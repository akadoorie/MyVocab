import { env } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { TurnstileVerifier } from '../src/auth/turnstile';
import { loadConfig } from '../src/config';

const base = {
  ...env,
  ENVIRONMENT: 'production',
  APP_URL: 'https://myvocab.example.workers.dev',
  TURNSTILE_SECRET_KEY: 'real-secret-value',
  CF_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
  CF_ACCESS_AUD: 'aud-tag',
} as unknown as Env;

describe('loadConfig', () => {
  it('accepts a complete production configuration', () => {
    const config = loadConfig({ ...base });
    expect(config.isProduction).toBe(true);
    expect(config.turnstileHostname).toBe('myvocab.example.workers.dev');
  });

  it('refuses production without Cloudflare Access, with a Turnstile test secret, or over http', () => {
    expect(() => loadConfig({ ...base, CF_ACCESS_AUD: '' } as unknown as Env)).toThrow(/Access/);
    expect(() =>
      loadConfig({
        ...base,
        TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
      } as unknown as Env),
    ).toThrow(/test secret/);
    expect(() =>
      loadConfig({ ...base, APP_URL: 'http://myvocab.example' } as unknown as Env),
    ).toThrow(/https/);
  });

  it('never includes secret values in the error', () => {
    try {
      loadConfig({ ...base, USAGE_HASH_SECRET: 'short' } as unknown as Env);
    } catch (e) {
      expect(String(e)).toContain('USAGE_HASH_SECRET');
      expect(String(e)).not.toContain('short');
    }
  });

  it('skips the Turnstile hostname check outside production', () => {
    expect(loadConfig(env).turnstileHostname).toBeNull();
  });
});

describe('TurnstileVerifier', () => {
  const ok = (body: unknown, status = 200) => vi.fn(async () => Response.json(body, { status }));

  it('accepts a successful token, sending secret, token and IP', async () => {
    const fetchFn = ok({ success: true, hostname: 'app.test' });
    expect(await new TurnstileVerifier('s', 'app.test', fetchFn).verify('tok', '1.2.3.4')).toBe(
      true,
    );
    const form = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    expect(form.get('secret')).toBe('s');
    expect(form.get('response')).toBe('tok');
    expect(form.get('remoteip')).toBe('1.2.3.4');
  });

  it('fails closed: no token, unsuccessful, wrong hostname, HTTP error or network error', async () => {
    expect(
      await new TurnstileVerifier('s', null, ok({ success: true })).verify(undefined, null),
    ).toBe(false);
    expect(await new TurnstileVerifier('s', null, ok({ success: false })).verify('t', null)).toBe(
      false,
    );
    expect(
      await new TurnstileVerifier(
        's',
        'app.test',
        ok({ success: true, hostname: 'evil.test' }),
      ).verify('t', null),
    ).toBe(false);
    expect(await new TurnstileVerifier('s', null, ok({}, 500)).verify('t', null)).toBe(false);
    const broken = vi.fn(async () => {
      throw new Error('network');
    });
    expect(await new TurnstileVerifier('s', null, broken).verify('t', null)).toBe(false);
  });
});
