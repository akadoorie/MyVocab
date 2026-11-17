import { applyD1Migrations, env, reset } from 'cloudflare:test';
import { beforeEach } from 'vitest';

// Every test starts from an empty database with the real migrations applied (including the
// hand-edited WITHOUT ROWID tables, D-010).
beforeEach(async () => {
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
