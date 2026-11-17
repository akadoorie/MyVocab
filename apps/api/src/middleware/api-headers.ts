import { createMiddleware } from 'hono/factory';

/**
 * Every /api/* response: never indexed, never cached by shared caches (PRD §12, §14.2), and the
 * security headers of PRD §14.4 (pages and static files get theirs from apps/web/public/_headers).
 */
export const apiHeaders = createMiddleware(async (c, next) => {
  await next();
  c.header('X-Robots-Tag', 'noindex, nofollow');
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
});
