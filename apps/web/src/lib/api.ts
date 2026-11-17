import {
  availableResponseSchema,
  errorResponseSchema,
  metaResponseSchema,
  startLoopResponseSchema,
  type AvailableQuery,
  type ErrorCode,
  type StartLoopRequest,
} from '@myvocab/contracts';
import type { z } from 'zod';

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

export const api = {
  meta: () => request('/meta', metaResponseSchema),
  available: (q: AvailableQuery) => {
    const params = new URLSearchParams({ source: q.source, target: q.target, type: q.type });
    if (q.categoryId !== undefined) params.set('categoryId', String(q.categoryId));
    return request(`/loops/available?${params}`, availableResponseSchema);
  },
  startLoop: (body: StartLoopRequest) =>
    request('/loops', startLoopResponseSchema, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
};
