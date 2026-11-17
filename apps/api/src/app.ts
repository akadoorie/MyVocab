import { Hono } from 'hono';
import type { HealthResponse } from '@myvocab/contracts';
import { loadConfig, type AppConfig } from './config';
import { createContainer, type Container } from './container';
import { apiHeaders } from './middleware/api-headers';
import { errorHandler, notFoundHandler } from './middleware/errors';
import { mutationGuard } from './middleware/mutation-guard';
import { publicRoutes } from './routes/public';
import { hashIp } from './services/usage-limit-service';
import type { Requester } from './services/loop-service';
import { APP_VERSION } from './version';

export type AppEnv = {
  Bindings: Env;
  Variables: {
    config: AppConfig;
    container: Container;
    /** Who is calling: resolved lazily (and once) per request. */
    requester: () => Promise<Requester>;
  };
};

function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let value: Promise<T> | undefined;
  return () => (value ??= fn());
}

/** Builds the Hono app for /api/* (PRD §12). Static assets are served by Workers Assets. */
export function createApp() {
  const app = new Hono<AppEnv>().basePath('/api');

  app.use('*', apiHeaders);
  app.get('/health', (c) => c.json<HealthResponse>({ ok: true, version: APP_VERSION }));

  app.use('*', async (c, next) => {
    const config = loadConfig(c.env);
    c.set('config', config);
    c.set('container', createContainer(c.env.DB, config));
    c.set(
      'requester',
      once(async () => {
        const ip = c.req.header('CF-Connecting-IP') ?? null;
        return {
          kind: 'guest',
          ip,
          ipHash: await hashIp(ip ?? 'unknown', config.USAGE_HASH_SECRET),
        };
      }),
    );
    await next();
  });
  app.use('*', mutationGuard);

  app.route('/', publicRoutes);

  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}
