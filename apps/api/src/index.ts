// Worker entry: HTTP (Hono) + scheduled (cron) handlers (PRD §10.3).
import { createApp } from './app';

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(_controller, _env, _ctx) {
    // M5: Trash purge + usage counter cleanup (PRD FR-A23).
  },
} satisfies ExportedHandler<Env>;
