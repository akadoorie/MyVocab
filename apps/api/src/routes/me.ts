import {
  deleteMeRequestSchema,
  knownDeleteQuerySchema,
  knownItemParamSchema,
  knownListQuerySchema,
  postKnownRequestSchema,
  restoreKnownRequestSchema,
  type MeResponse,
  type SessionUser,
} from '@myvocab/contracts';
import { Hono, type Context } from 'hono';
import { deleteCookie } from 'hono/cookie';
import type { AppEnv } from '../app';
import { parseOrThrow, readJson } from '../lib/validate';
import { UnauthorizedError } from '../middleware/errors';

/** The signed-in user; 401 for guests (PRD §12.3). */
async function requireUser(c: Context<AppEnv>): Promise<SessionUser> {
  const user = await c.get('currentUser')();
  if (!user) throw new UnauthorizedError();
  return user;
}

/** Clears Better Auth's session cookies on this response (after the account is gone). */
async function clearAuthCookies(c: Context<AppEnv>): Promise<void> {
  const ctx = await c.get('auth')().$context;
  for (const cookie of [ctx.authCookies.sessionToken, ctx.authCookies.dontRememberToken]) {
    deleteCookie(c, cookie.name, {
      path: cookie.attributes.path ?? '/',
      secure: cookie.attributes.secure ?? false,
      httpOnly: true,
      sameSite: 'Lax',
    });
  }
}

/** Current user and known items (PRD §12.2–12.3). `user_id` always comes from the session. */
export const meRoutes = new Hono<AppEnv>()
  .get('/me', async (c) => c.json<MeResponse>({ user: await c.get('currentUser')() }))

  .delete('/me', async (c) => {
    const user = await requireUser(c);
    parseOrThrow(deleteMeRequestSchema, await readJson(c.req));
    await c.get('container').accounts.deleteAccount(user.id);
    await clearAuthCookies(c);
    return c.json({ ok: true as const });
  })

  .get('/me/known', async (c) => {
    const user = await requireUser(c);
    const q = parseOrThrow(knownListQuerySchema, c.req.query());
    return c.json(await c.get('container').known.list(user.id, q));
  })

  .post('/me/known', async (c) => {
    const user = await requireUser(c);
    const body = parseOrThrow(postKnownRequestSchema, await readJson(c.req));
    const saved = await c.get('container').known.mark(user.id, body.items);
    return c.json({ saved });
  })

  .post('/me/known/restore', async (c) => {
    const user = await requireUser(c);
    const body = parseOrThrow(restoreKnownRequestSchema, await readJson(c.req));
    const restored = await c.get('container').known.restore(user.id, body);
    return c.json({ restored });
  })

  .delete('/me/known/:itemId', async (c) => {
    const user = await requireUser(c);
    const { itemId } = parseOrThrow(knownItemParamSchema, c.req.param());
    const { target } = parseOrThrow(knownDeleteQuerySchema, c.req.query());
    const removed = await c.get('container').known.unmark(user.id, itemId, target);
    return c.json({ removed });
  });
