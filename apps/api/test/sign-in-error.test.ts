import { describe, expect, it } from 'vitest';
import { neutralSignInRedirect, withNeutralSignInRedirect } from '../src/auth/sign-in-error';
import { api } from './helpers';

const ORIGIN = 'https://app.example';

describe('neutral sign-in error redirects (FR-L56)', () => {
  it('maps a banned account to ?signin=refused and drops the code and description', () => {
    const out = neutralSignInRedirect(
      '/?signin=error&error=BANNED_USER&error_description=You+have+been+banned',
      ORIGIN,
    );
    expect(out).toBe(`${ORIGIN}/?signin=refused`);
  });

  it('maps every other error to ?signin=error', () => {
    for (const code of ['access_denied', 'state_mismatch', '']) {
      expect(neutralSignInRedirect(`${ORIGIN}/?signin=error&error=${code}`, ORIGIN)).toBe(
        `${ORIGIN}/?signin=error`,
      );
    }
  });

  it('leaves other redirects alone (success, foreign origins, other pages)', () => {
    for (const loc of ['/', '/known', 'https://accounts.google.com/o?x=1', `${ORIGIN}/?a=1`]) {
      expect(neutralSignInRedirect(loc, ORIGIN)).toBe(loc);
    }
    const ok = new Response(null, { status: 200 });
    expect(withNeutralSignInRedirect(ok, ORIGIN)).toBe(ok);
  });

  it('a real failed callback lands on the neutral address', async () => {
    const res = await api('/auth/callback/google?code=x&state=forged', { redirect: 'manual' });
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = new URL(res.headers.get('Location') ?? '');
    expect([...location.searchParams.keys()]).toEqual(['signin']);
    expect(location.searchParams.get('signin')).toBe('error');
  });
});
