import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../app';
import { RateLimitedError } from './errors';

type LimiterName = 'RL_PRACTICES' | 'RL_AVAILABLE' | 'RL_AUTH' | 'RL_IMPORT' | 'RL_ADMIN';

/** Per-IP key: the hashed IP (the same HMAC as the usage counters), never the raw address. */
export async function ipKey(c: Context<AppEnv>): Promise<string> {
  const requester = await c.get('requester')();
  if (requester.kind === 'guest') return `ip:${requester.ipHash}`;
  // Signed-in requests are keyed by account (an IP can be shared by many learners).
  return `user:${requester.userId}`;
}

/** Per-admin key (used after requireAdmin). */
export function adminKey(c: Context<AppEnv>): string {
  return `admin:${c.get('actor')?.userId ?? 'unknown'}`;
}

/**
 * Burst limits (PRD §14.3) with the Workers Rate Limiting binding: per minute, in memory at the
 * edge, no D1 writes. Over the limit → 429 before any other work.
 */
export function burstLimit(
  name: LimiterName,
  key: (c: Context<AppEnv>) => string | Promise<string>,
) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const limiter = c.env[name] as RateLimit | undefined;
    if (limiter) {
      const { success } = await limiter.limit({ key: await key(c) });
      if (!success)
        throw new RateLimitedError('Too many requests. Please slow down and try again.');
    }
    await next();
  });
}
