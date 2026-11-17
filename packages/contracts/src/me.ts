import { z } from 'zod';

/** The signed-in user as the browser sees it (PRD §12.2). */
export const sessionUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  role: z.enum(['user', 'admin']),
  /** Email listed in ADMIN_EMAILS (verified): can't be demoted (PRD §13.2). */
  isOwner: z.boolean(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

/** GET /api/me. */
export const meResponseSchema = z.object({ user: sessionUserSchema.nullable() });
export type MeResponse = z.infer<typeof meResponseSchema>;

/** DELETE /api/me: typed confirmation (FR-L71). */
export const deleteMeRequestSchema = z.object({ confirm: z.literal('DELETE') }).strict();
export type DeleteMeRequest = z.infer<typeof deleteMeRequestSchema>;

/**
 * The body of Better Auth's `POST /api/auth/sign-in/social`, as this app allows it: Google only,
 * same-site relative callback paths, nothing else (PRD §13.1).
 */
const relativePath = z
  .string()
  .max(512)
  .regex(/^\/(?![/\\])[^\s]*$/, 'Must be a path on this site');
export const socialSignInRequestSchema = z
  .object({
    provider: z.literal('google'),
    callbackURL: relativePath,
    errorCallbackURL: relativePath.optional(),
  })
  .strict();
export type SocialSignInRequest = z.infer<typeof socialSignInRequestSchema>;

export const socialSignInResponseSchema = z.object({ url: z.url(), redirect: z.boolean() });
