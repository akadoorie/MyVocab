import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../app';
import { ForbiddenError, ValidationError } from './errors';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF defense for /api mutations (PRD §12, §14.4): the Origin must equal APP_URL and the body must
 * be JSON (multipart only for the CSV import). Better Auth routes run their own origin checks.
 */
export const mutationGuard = createMiddleware<AppEnv>(async (c, next) => {
  if (!MUTATING.has(c.req.method) || c.req.path.startsWith('/api/auth/')) return next();

  const expected = new URL(c.get('config').APP_URL).origin;
  if (c.req.header('Origin') !== expected) throw new ForbiddenError('Cross-origin request refused');

  const contentType = c.req.header('Content-Type') ?? '';
  const isImport = c.req.path === '/api/admin/import';
  const ok = isImport
    ? contentType.startsWith('multipart/form-data')
    : contentType.startsWith('application/json') || c.req.method === 'DELETE';
  if (!ok) throw new ValidationError('Unsupported content type');
  return next();
});
