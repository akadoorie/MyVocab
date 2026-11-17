import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../app';
import { CloudflareAccessVerifier } from '../auth/access';
import { ForbiddenError, UnauthorizedError } from './errors';

/**
 * Both locks on every /api/admin route (PRD §13.3–13.4):
 * 1. the DB-backed session must belong to a non-banned admin (no session → 401, else 403);
 * 2. in production, a valid Cloudflare Access JWT whose email matches the session (else 403).
 * The Access check is skipped only when ENVIRONMENT is development or test; production startup
 * refuses to run without the Access configuration (config.ts).
 */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = await c.get('currentUser')();
  if (!user) throw new UnauthorizedError();
  if (user.role !== 'admin') throw new ForbiddenError('Admins only');

  const config = c.get('config');
  if (config.ENVIRONMENT !== 'development' && config.ENVIRONMENT !== 'test') {
    const access = new CloudflareAccessVerifier(config.CF_ACCESS_TEAM_DOMAIN, config.CF_ACCESS_AUD);
    if (!(await access.verify(c.req.header('Cf-Access-Jwt-Assertion'), user.email))) {
      throw new ForbiddenError('Cloudflare Access verification failed');
    }
  }

  c.set('actor', { userId: user.id, email: user.email });
  await next();
});
