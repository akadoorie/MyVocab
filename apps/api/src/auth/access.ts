import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

/**
 * Lock 2 of the admin area (PRD §13.4): the `Cf-Access-Jwt-Assertion` header Cloudflare Access
 * adds to every request it lets through. Verified here as defense in depth: RS256 signature
 * against the team's certs (cached), `aud`, `iss`, expiry, and the Access email must equal the
 * signed-in user's email. Anything missing or invalid fails closed.
 */

export interface AccessCheck {
  verify(token: string | undefined, sessionEmail: string): Promise<boolean>;
}

/** "team.cloudflareaccess.com", "https://team.cloudflareaccess.com/" → "team.cloudflareaccess.com". */
export function normalizeTeamDomain(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
}

// JWKS per team domain, kept for the isolate's lifetime (jose caches and refreshes the keys).
const jwksByTeam = new Map<string, JWTVerifyGetKey>();

function teamKeys(teamDomain: string): JWTVerifyGetKey {
  let keys = jwksByTeam.get(teamDomain);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    jwksByTeam.set(teamDomain, keys);
  }
  return keys;
}

export class CloudflareAccessVerifier implements AccessCheck {
  private readonly teamDomain: string;

  constructor(
    teamDomain: string,
    private readonly audience: string,
  ) {
    this.teamDomain = normalizeTeamDomain(teamDomain);
  }

  async verify(token: string | undefined, sessionEmail: string): Promise<boolean> {
    if (!token || !this.teamDomain || !this.audience) return false;
    try {
      const { payload } = await jwtVerify(token, teamKeys(this.teamDomain), {
        issuer: `https://${this.teamDomain}`,
        audience: this.audience,
        algorithms: ['RS256'],
      });
      const email = typeof payload.email === 'string' ? payload.email : '';
      return email.length > 0 && email.toLowerCase() === sessionEmail.toLowerCase();
    } catch {
      return false;
    }
  }
}
