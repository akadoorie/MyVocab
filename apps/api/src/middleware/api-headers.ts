import { createMiddleware } from 'hono/factory';

/**
 * Every /api/* response is never indexed and never cached by shared caches (PRD §12, §14.2).
 */
export const apiHeaders = createMiddleware(async (c, next) => {
  await next();
  c.header('X-Robots-Tag', 'noindex, nofollow');
  c.header('Cache-Control', 'no-store');
});
