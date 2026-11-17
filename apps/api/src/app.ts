import { Hono } from 'hono';
import type { HealthResponse } from '@myvocab/contracts';
import { apiHeaders } from './middleware/api-headers';
import { errorHandler, notFoundHandler } from './middleware/errors';
import { APP_VERSION } from './version';

export type AppEnv = { Bindings: Env };

/** Builds the Hono app for /api/* (PRD §12). Static assets are served by Workers Assets. */
export function createApp() {
  const app = new Hono<AppEnv>().basePath('/api');

  app.use('*', apiHeaders);

  app.get('/health', (c) => c.json<HealthResponse>({ ok: true, version: APP_VERSION }));

  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}
