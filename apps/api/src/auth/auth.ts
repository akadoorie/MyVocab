import type { SessionUser } from '@myvocab/contracts';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins/admin';
import { sql } from 'drizzle-orm';
import type { AppConfig } from '../config';
import type { Db } from '../db/client';
import { account, session, user, verification } from '../db/schema';

/**
 * Better Auth (PRD §13): Google only, DB-backed sessions in an HttpOnly cookie, and the admin
 * plugin for `role` (`input: false`) and bans. Built per request from the request's bindings.
 *
 * Privacy and write budget (PRD §11.2, §14.4):
 * - sessions store no IP address or user agent; Google tokens are never stored;
 * - OAuth state lives in an encrypted cookie, so starting a sign-in writes nothing to D1;
 * - a session is refreshed at most once a day (`updateAge`), 30 days rolling.
 */

const DAY = 60 * 60 * 24;
export const SESSION_EXPIRES_IN = 30 * DAY;
export const SESSION_UPDATE_AGE = DAY;

type AuthConfig = Pick<
  AppConfig,
  | 'APP_URL'
  | 'BETTER_AUTH_SECRET'
  | 'GOOGLE_CLIENT_ID'
  | 'GOOGLE_CLIENT_SECRET'
  | 'ownerEmails'
  | 'isProduction'
>;

const NO_TOKENS = {
  accessToken: null,
  refreshToken: null,
  idToken: null,
  accessTokenExpiresAt: null,
  refreshTokenExpiresAt: null,
};

/** An owner: a verified email listed in ADMIN_EMAILS (PRD §13.2). */
export function isOwnerEmail(
  u: { email: string; emailVerified: boolean },
  owners: ReadonlySet<string>,
): boolean {
  return u.emailVerified && owners.has(u.email.toLowerCase());
}

export function createAuth(config: AuthConfig, db: Db) {
  const owners = config.ownerEmails;
  return betterAuth({
    appName: 'MyVocab',
    baseURL: config.APP_URL,
    basePath: '/api/auth',
    secret: config.BETTER_AUTH_SECRET,
    trustedOrigins: [new URL(config.APP_URL).origin],
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: { user, session, account, verification },
    }),
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: config.GOOGLE_CLIENT_ID,
        clientSecret: config.GOOGLE_CLIENT_SECRET,
        prompt: 'select_account',
        disableIdTokenSignIn: true,
      },
    },
    session: { expiresIn: SESSION_EXPIRES_IN, updateAge: SESSION_UPDATE_AGE },
    account: {
      updateAccountOnSignIn: false,
      storeStateStrategy: 'cookie',
    },
    user: { deleteUser: { enabled: false } },
    rateLimit: { storage: 'memory' },
    advanced: {
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
      useSecureCookies: config.isProduction,
    },
    telemetry: { enabled: false },
    onAPIError: { errorURL: `${new URL(config.APP_URL).origin}/?signin=error` },
    databaseHooks: {
      user: {
        create: {
          // A new owner becomes admin on the first sign-in with a verified email.
          before: async (u) => (isOwnerEmail(u, owners) ? { data: { role: 'admin' } } : undefined),
        },
      },
      session: {
        create: {
          before: async () => ({ data: { ipAddress: null, userAgent: null } }),
          // An existing user whose verified email was added to ADMIN_EMAILS later: promote on the
          // next sign-in. One conditional UPDATE: writes only when the role actually changes.
          after: async (s) => {
            if (owners.size === 0) return;
            await db.run(sql`
              UPDATE "user" SET role = 'admin', updated_at = ${Date.now()}
              WHERE id = ${s.userId} AND role <> 'admin' AND email_verified = 1
                AND lower(email) IN (SELECT value FROM json_each(${JSON.stringify([...owners])}))
            `);
          },
        },
      },
      account: {
        create: { before: async () => ({ data: NO_TOKENS }) },
        update: { before: async () => ({ data: NO_TOKENS }) },
      },
    },
    plugins: [admin({ defaultRole: 'user', adminRoles: ['admin'] })],
  });
}

export type Auth = ReturnType<typeof createAuth>;

type AuthUserRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null | undefined;
  role?: string | null | undefined;
  banned?: boolean | null | undefined;
  banExpires?: Date | null | undefined;
};

/** Better Auth's user → the app's view of it; a banned user counts as signed out. */
export function toSessionUser(
  u: AuthUserRow,
  owners: ReadonlySet<string>,
  now = Date.now(),
): SessionUser | null {
  const banActive = u.banned === true && (!u.banExpires || u.banExpires.getTime() > now);
  if (banActive) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image ?? null,
    role: u.role === 'admin' ? 'admin' : 'user',
    isOwner: isOwnerEmail(u, owners),
  };
}

/**
 * The Better Auth endpoints this app uses. Everything else (password flows, account linking,
 * the admin plugin's HTTP endpoints, impersonation…) is refused before it reaches Better Auth:
 * admin actions go through /api/admin with both locks and the audit log (PRD §13).
 */
export const ALLOWED_AUTH_ROUTES = new Set([
  'POST /api/auth/sign-in/social',
  'GET /api/auth/callback/google',
  'POST /api/auth/callback/google',
  'POST /api/auth/sign-out',
]);
