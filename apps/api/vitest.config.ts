import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Integration tests run inside the Workers runtime (Miniflare) with a local D1 (PRD §17).
export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          // Generous burst limits for the suite; the 429 path is tested with a fake limiter.
          ratelimits: Object.fromEntries(
            ['RL_LOOPS', 'RL_AVAILABLE', 'RL_AUTH', 'RL_IMPORT', 'RL_ADMIN'].map((name, i) => [
              name,
              { namespace_id: String(9001 + i), simple: { limit: 100_000, period: 60 as const } },
            ]),
          ),
          bindings: {
            ENVIRONMENT: 'test',
            APP_URL: 'http://localhost:5173',
            TURNSTILE_SITE_KEY: '1x00000000000000000000BB',
            CF_ACCESS_TEAM_DOMAIN: '',
            CF_ACCESS_AUD: '',
            TEST_MIGRATIONS: migrations,
            // Test-only values (CI has no .dev.vars). Turnstile: Cloudflare's always-pass test secret.
            TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
            USAGE_HASH_SECRET: 'test-usage-hash-secret-0123456789',
            BETTER_AUTH_SECRET: 'test-better-auth-secret-0123456789abcdef',
            GOOGLE_CLIENT_ID: 'test-client-id',
            GOOGLE_CLIENT_SECRET: 'test-client-secret',
            ADMIN_EMAILS: 'owner@example.test',
          },
        },
      }),
    ],
    test: {
      include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
      setupFiles: ['./test/apply-migrations.ts'],
    },
  };
});
