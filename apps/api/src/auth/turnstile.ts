/** Bot check for guests (PRD §14.3): Cloudflare Turnstile siteverify. */
export interface BotCheck {
  verify(token: string | undefined, remoteIp: string | null): Promise<boolean>;
}

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

type SiteverifyResponse = { success: boolean; hostname?: string; 'error-codes'?: string[] };

export class TurnstileVerifier implements BotCheck {
  constructor(
    private readonly secret: string,
    /** When set, the token must have been issued for this hostname. */
    private readonly expectedHostname: string | null,
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
  ) {}

  async verify(token: string | undefined, remoteIp: string | null): Promise<boolean> {
    if (!token) return false;
    const body = new FormData();
    body.append('secret', this.secret);
    body.append('response', token);
    if (remoteIp) body.append('remoteip', remoteIp);
    try {
      const res = await this.fetchFn(SITEVERIFY_URL, { method: 'POST', body });
      if (!res.ok) return false;
      const data = (await res.json()) as SiteverifyResponse;
      if (!data.success) return false;
      return this.expectedHostname === null || data.hostname === this.expectedHostname;
    } catch {
      return false; // fail closed
    }
  }
}
