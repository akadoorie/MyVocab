import { z } from 'zod';

/**
 * Static (deploy-time) configuration, validated with Zod at first use (PRD §10.4 "Configuration").
 * Production invariants are asserted here: the app refuses to serve if they don't hold.
 */

const TURNSTILE_TEST_SECRETS = new Set([
  '1x0000000000000000000000000000000AA',
  '2x0000000000000000000000000000000AA',
  '3x0000000000000000000000000000000AA',
]);

const envSchema = z
  .object({
    ENVIRONMENT: z.enum(['development', 'test', 'production']),
    APP_URL: z.url(),
    TURNSTILE_SITE_KEY: z.string().min(1),
    TURNSTILE_SECRET_KEY: z.string().min(1),
    USAGE_HASH_SECRET: z.string().min(16),
    BETTER_AUTH_SECRET: z.string().min(32),
    GOOGLE_CLIENT_ID: z.string().default(''),
    GOOGLE_CLIENT_SECRET: z.string().default(''),
    /** Comma-separated owner emails (PRD §13.2). */
    ADMIN_EMAILS: z.string().default(''),
    CF_ACCESS_TEAM_DOMAIN: z.string().default(''),
    CF_ACCESS_AUD: z.string().default(''),
  })
  .superRefine((env, ctx) => {
    if (env.ENVIRONMENT === 'test') {
      // Test mode enables /api/test/*: it may only ever run on this machine (PRD §12.5).
      const host = new URL(env.APP_URL).hostname;
      if (host !== 'localhost' && host !== '127.0.0.1') {
        ctx.addIssue({ code: 'custom', message: 'ENVIRONMENT=test requires a localhost APP_URL' });
      }
    }
    if (env.ENVIRONMENT !== 'production') return;
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      ctx.addIssue({ code: 'custom', message: 'Google OAuth must be configured in production' });
    }
    if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) {
      ctx.addIssue({
        code: 'custom',
        message: 'Cloudflare Access must be configured in production',
      });
    }
    if (TURNSTILE_TEST_SECRETS.has(env.TURNSTILE_SECRET_KEY)) {
      ctx.addIssue({ code: 'custom', message: 'Turnstile test secret used in production' });
    }
    if (!env.APP_URL.startsWith('https://')) {
      ctx.addIssue({ code: 'custom', message: 'APP_URL must be https in production' });
    }
  });

export type AppConfig = z.infer<typeof envSchema> & {
  isProduction: boolean;
  /** Expected Turnstile hostname; null outside production (test keys report another host). */
  turnstileHostname: string | null;
  /** Owner emails, lower-cased (PRD §13.2). */
  ownerEmails: ReadonlySet<string>;
};

export function parseOwnerEmails(raw: string): Set<string> {
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
  );
}

const cache = new WeakMap<object, AppConfig>();

export function loadConfig(env: Env): AppConfig {
  const cached = cache.get(env);
  if (cached) return cached;
  const result = envSchema.safeParse(env);
  if (!result.success) {
    // Names only: never log values (they may be secrets).
    const problems = result.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`);
    throw new Error(`Invalid configuration: ${problems.join('; ')}`);
  }
  const isProduction = result.data.ENVIRONMENT === 'production';
  const config: AppConfig = {
    ...result.data,
    isProduction,
    turnstileHostname: isProduction ? new URL(result.data.APP_URL).hostname : null,
    ownerEmails: parseOwnerEmails(result.data.ADMIN_EMAILS),
  };
  cache.set(env, config);
  return config;
}
