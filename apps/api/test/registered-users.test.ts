import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REGISTERED_USERS_TTL_MS,
  resetRegisteredUsersCache,
} from '../src/services/account-service';
import { api, signIn } from './helpers';

beforeEach(resetRegisteredUsersCache);
afterEach(() => vi.useRealTimers());

const registered = async () =>
  (await (await api('/stats/registered-users')).json<{ registeredUsers: number }>())
    .registeredUsers;

describe('GET /api/stats/registered-users (D-036)', () => {
  it('counts accounts that are not admins and not banned, for anyone', async () => {
    await signIn('user', 'one@example.test');
    await signIn('user', 'two@example.test');
    const banned = await signIn('user', 'banned@example.test');
    await signIn('admin', 'admin@example.test');
    await env.DB.prepare('UPDATE user SET banned = 1 WHERE id = ?').bind(banned.userId).run();

    const res = await api('/stats/registered-users');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ registeredUsers: 2, showFrom: 100 });
  });

  it('tells the page the admin threshold for showing it (D-082)', async () => {
    await env.DB.prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ('stats.registeredUsersMin', '0', ?)`,
    )
      .bind(Date.now())
      .run();
    expect(await (await api('/stats/registered-users')).json()).toMatchObject({ showFrom: 0 });
  });

  it('keeps the count for 30 minutes, then counts again', async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 10, 20, 12), toFake: ['Date'] });
    await signIn('user', 'first@example.test');
    expect(await registered()).toBe(1);

    await signIn('user', 'second@example.test');
    vi.setSystemTime(Date.UTC(2026, 10, 20, 12) + REGISTERED_USERS_TTL_MS - 1000);
    expect(await registered()).toBe(1);

    vi.setSystemTime(Date.UTC(2026, 10, 20, 12) + REGISTERED_USERS_TTL_MS + 1000);
    expect(await registered()).toBe(2);
  });
});
