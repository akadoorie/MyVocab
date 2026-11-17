// Worker entry: HTTP (Hono) + scheduled (cron) handlers (PRD §10.3).
import { createApp } from './app';
import { loadConfig } from './config';
import { createContainer } from './container';

const app = createApp();

export default {
  fetch: app.fetch,
  /** Hourly (PRD FR-A23): Trash purge, usage counter and expired session cleanup. Counts only. */
  async scheduled(_controller, env, ctx) {
    const container = createContainer(env.DB, loadConfig(env));
    ctx.waitUntil(
      container.maintenance
        .hourly()
        .then((result) => console.log(JSON.stringify({ level: 'info', msg: 'cron', ...result })))
        .catch((error: unknown) =>
          console.error(
            JSON.stringify({ level: 'error', msg: 'cron failed', name: (error as Error).name }),
          ),
        ),
    );
  },
} satisfies ExportedHandler<Env>;
