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
          bindings: {
            ENVIRONMENT: 'test',
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
