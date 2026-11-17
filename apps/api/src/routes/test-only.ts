import { makeSignature } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { AppEnv } from '../app';
import { toSessionUser } from '../auth/auth';
import { user } from '../db/schema';
import { parseOrThrow, readJson } from '../lib/validate';
import { NotFoundError } from '../middleware/errors';

const testSessionSchema = z
  .object({
    role: z.enum(['user', 'admin']),
    email: z.email().max(200).optional(),
    name: z.string().min(1).max(100).optional(),
  })
  .strict();

/**
 * Test-only endpoints (PRD §12.5). They answer 404 unless ENVIRONMENT=test, and the config refuses
 * ENVIRONMENT=test on anything but a localhost APP_URL, so they can't exist in production.
 */
export const testRoutes = new Hono<AppEnv>()
  .use('*', async (c, next) => {
    if (c.get('config').ENVIRONMENT !== 'test') throw new NotFoundError();
    await next();
  })
  /** Signs in as a seeded test user with the given role (for Playwright and integration tests). */
  .post('/session', async (c) => {
    const body = parseOrThrow(testSessionSchema, await readJson(c.req));
    const email = (body.email ?? `${body.role}@example.test`).toLowerCase();
    const id = `test_${email.replace(/[^a-z0-9]/g, '_')}`;
    const now = new Date();
    const { db } = c.get('container');
    await db
      .insert(user)
      .values({
        id,
        name: body.name ?? `Test ${body.role}`,
        email,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
        role: body.role,
      })
      .onConflictDoUpdate({ target: user.email, set: { role: body.role, updatedAt: now } });
    const row = await db.select().from(user).where(eq(user.email, email)).get();
    if (!row) throw new Error('test user missing');

    const ctx = await c.get('auth')().$context;
    const session = await ctx.internalAdapter.createSession(row.id);
    const { name, attributes } = ctx.authCookies.sessionToken;
    setCookie(c, name, `${session.token}.${await makeSignature(session.token, ctx.secret)}`, {
      path: attributes.path ?? '/',
      httpOnly: true,
      secure: attributes.secure ?? false,
      sameSite: 'Lax',
      ...(attributes.maxAge === undefined ? {} : { maxAge: attributes.maxAge }),
    });
    return c.json({ user: toSessionUser(row, c.get('config').ownerEmails) });
  });
