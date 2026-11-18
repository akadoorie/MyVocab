/**
 * After a failed Google sign-in Better Auth redirects to `/?signin=error&error=<CODE>` plus an
 * `error_description` text. Neither should reach the address bar: the code and the text can say
 * why (e.g. a banned account). This rewrites that redirect to one of two neutral addresses
 * (PRD FR-L56):
 * - `/?signin=refused`: the account may not sign in (today: a banned account);
 * - `/?signin=error`: anything else (cancelled, expired state, provider error…).
 * Any other redirect is returned unchanged.
 */
const REFUSED_CODES = new Set(['BANNED_USER']);

export function neutralSignInRedirect(location: string, appOrigin: string): string {
  let url: URL;
  try {
    url = new URL(location, appOrigin);
  } catch {
    return location;
  }
  if (url.origin !== appOrigin || url.searchParams.get('signin') !== 'error') return location;
  const code = url.searchParams.get('error') ?? '';
  return `${appOrigin}/?signin=${REFUSED_CODES.has(code) ? 'refused' : 'error'}`;
}

/** Applies {@link neutralSignInRedirect} to a Better Auth response (headers may be immutable). */
export function withNeutralSignInRedirect(res: Response, appOrigin: string): Response {
  const location = res.headers.get('Location');
  if (!location || res.status < 300 || res.status >= 400) return res;
  const neutral = neutralSignInRedirect(location, appOrigin);
  if (neutral === location) return res;
  const headers = new Headers(res.headers);
  headers.set('Location', neutral);
  return new Response(res.body, { status: res.status, headers });
}
