import { Hono } from 'hono';
import {
  socialSignInRequestSchema,
  type HealthResponse,
  type SessionUser,
} from '@myvocab/contracts';
import { ALLOWED_AUTH_ROUTES, createAuth, toSessionUser, type Auth } from './auth/auth';
import { loadConfig, type AppConfig } from './config';
import { createContainer, type Container } from './container';
import { parseOrThrow, readJson } from './lib/validate';
import { apiHeaders } from './middleware/api-headers';
import { errorHandler, NotFoundError, notFoundHandler } from './middleware/errors';
import { mutationGuard } from './middleware/mutation-guard';
import { meRoutes } from './routes/me';
import { publicRoutes } from './routes/public';
import { testRoutes } from './routes/test-only';
import { hashIp } from './services/usage-limit-service';
import type { Requester } from './services/loop-service';
import { APP_VERSION } from './version';

export type AppEnv = {
  Bindings: Env;
  Variables: {
    config: AppConfig;
    container: Container;
    /** Better Auth for this request, created on first use (PRD §13.1). */
    auth: () => Auth;
    /** The signed-in user (null for guests and banned users), resolved once per request. */
    currentUser: () => Promise<SessionUser | null>;
    /** Who is calling: resolved lazily (and once) per request. */
    requester: () => Promise<Requester>;
  };
};

function once<T>(fn: () => T): () => T {
  let done = false;
  let value: T;
  return () => {
    if (!done) {
      value = fn();
      done = true;
    }
    return value;
  };
}

/** Better Auth's session cookie (plain on http://localhost, `__Secure-` prefixed on https). */
const SESSION_COOKIE = /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=/;

/** Builds the Hono app for /api/* (PRD §12). Static assets are served by Workers Assets. */
export function createApp() {
  const app = new Hono<AppEnv>().basePath('/api');

  app.use('*', apiHeaders);
  app.get('/health', (c) => c.json<HealthResponse>({ ok: true, version: APP_VERSION }));

  app.use('*', async (c, next) => {
    const config = loadConfig(c.env);
    const container = createContainer(c.env.DB, config);
    c.set('config', config);
    c.set('container', container);
    c.set(
      'auth',
      once(() => createAuth(config, container.db)),
    );

    // A rolling session refresh (at most daily) comes back as a Set-Cookie: pass it on.
    const refreshedCookies: string[] = [];
    c.set(
      'currentUser',
      once(async () => {
        // Guests have no session cookie: don't even build Better Auth for them.
        if (!SESSION_COOKIE.test(c.req.header('Cookie') ?? '')) return null;
        const { headers, response } = await c
          .get('auth')()
          .api.getSession({ headers: c.req.raw.headers, returnHeaders: true });
        refreshedCookies.push(...headers.getSetCookie());
        return response ? toSessionUser(response.user, config.ownerEmails) : null;
      }),
    );
    c.set(
      'requester',
      once(async (): Promise<Requester> => {
        const user = await c.get('currentUser')();
        if (user) return { kind: 'learner', userId: user.id, isAdmin: user.role === 'admin' };
        const ip = c.req.header('CF-Connecting-IP') ?? null;
        return {
          kind: 'guest',
          ip,
          ipHash: await hashIp(ip ?? 'unknown', config.USAGE_HASH_SECRET),
        };
      }),
    );
    await next();
    for (const cookie of refreshedCookies) c.res.headers.append('Set-Cookie', cookie);
  });
  app.use('*', mutationGuard);

  // Better Auth: only the endpoints this app uses; the body of sign-in is checked strictly.
  app.on(['GET', 'POST'], '/auth/*', async (c) => {
    if (!ALLOWED_AUTH_ROUTES.has(`${c.req.method} ${c.req.path}`)) throw new NotFoundError();
    if (c.req.path === '/api/auth/sign-in/social') {
      parseOrThrow(socialSignInRequestSchema, await readJson(c.req.raw.clone()));
    }
    return c.get('auth')().handler(c.req.raw);
  });

  app.route('/', publicRoutes);
  app.route('/', meRoutes);
  app.route('/test', testRoutes);

  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}
