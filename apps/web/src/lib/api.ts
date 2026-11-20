import {
  availableResponseSchema,
  deleteKnownResponseSchema,
  errorResponseSchema,
  knownListResponseSchema,
  meResponseSchema,
  metaResponseSchema,
  postKnownResponseSchema,
  registeredUsersResponseSchema,
  restoreKnownResponseSchema,
  socialSignInResponseSchema,
  startLoopResponseSchema,
  type AvailableQuery,
  type ErrorCode,
  type KnownListQuery,
  type KnownMarkInput,
  type RestoreKnownRequest,
  type SocialSignInRequest,
  type StartLoopRequest,
} from '@myvocab/contracts';
import { z } from 'zod';

/** An error response from /api, in the shared shape (PRD §12). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

async function request<S extends z.ZodType>(
  path: string,
  schema: S,
  init: RequestInit = {},
): Promise<z.infer<S>> {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: { Accept: 'application/json', ...init.headers },
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = errorResponseSchema.safeParse(body);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiError(res.status, code, message, details);
    }
    throw new ApiError(res.status, 'INTERNAL', `Request failed (${res.status})`);
  }
  return schema.parse(body);
}

function json(method: string, body: unknown, extra: RequestInit = {}): RequestInit {
  return {
    ...extra,
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

const okSchema = z.object({ ok: z.literal(true) });

export const api = {
  meta: () => request('/meta', metaResponseSchema),
  registeredUsers: () => request('/stats/registered-users', registeredUsersResponseSchema),
  available: (q: AvailableQuery) => {
    const params = new URLSearchParams({ source: q.source, target: q.target, type: q.type });
    if (q.categoryId !== undefined) params.set('categoryId', String(q.categoryId));
    return request(`/loops/available?${params}`, availableResponseSchema);
  },
  startLoop: (body: StartLoopRequest) =>
    request('/loops', startLoopResponseSchema, json('POST', body)),

  // Current user (PRD §12.2)
  me: () => request('/me', meResponseSchema),
  deleteMe: () => request('/me', okSchema, json('DELETE', { confirm: 'DELETE' })),
  signInSocial: (body: SocialSignInRequest) =>
    request('/auth/sign-in/social', socialSignInResponseSchema, json('POST', body)),
  signOut: () => request('/auth/sign-out', z.unknown(), json('POST', {})),

  // Known items (PRD §12.3)
  markKnown: (items: KnownMarkInput[], keepalive = false) =>
    request('/me/known', postKnownResponseSchema, json('POST', { items }, { keepalive })),
  /** Undo of a Know in one direction (D-028). */
  unmarkKnown: (itemId: number, target: string) =>
    request(`/me/known/${itemId}?target=${encodeURIComponent(target)}`, deleteKnownResponseSchema, {
      method: 'DELETE',
    }),
  restoreKnown: (body: RestoreKnownRequest) =>
    request('/me/known/restore', restoreKnownResponseSchema, json('POST', body)),
  knownList: (q: KnownListQuery) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(q)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    return request(`/me/known?${params}`, knownListResponseSchema);
  },
};
