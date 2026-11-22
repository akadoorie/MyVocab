import {
  adminTopicListSchema,
  adminTopicSchema,
  adminItemListResponseSchema,
  adminItemSchema,
  adminLanguageListSchema,
  adminStatsSchema,
  adminUserListResponseSchema,
  adminUserSchema,
  auditListResponseSchema,
  cardViewSchema,
  errorResponseSchema,
  importReportSchema,
  settingsSchema,
  trashListResponseSchema,
  type AdminItemCreate,
  type AdminItemListQuery,
  type AdminItemPatch,
  type AdminUserPatch,
  type AuditQuery,
  type LanguageCreate,
  type SettingsUpdate,
} from '@myvocab/contracts';
import { z } from 'zod';
import { ApiError } from '../../lib/api';

/**
 * The admin API client (PRD §13.4). Cloudflare Access sits in front of /api/admin in production:
 * when its session expires, requests come back as a redirect or a non-JSON 401/403. The client then
 * reloads /admin with a full navigation so Access can ask for the one-time code again.
 */
export function onAccessExpired(): void {
  window.location.assign('/admin');
}

async function adminRequest<S extends z.ZodType>(
  path: string,
  schema: S,
  init: RequestInit = {},
): Promise<z.infer<S>> {
  const res = await fetch(`/api/admin${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: { Accept: 'application/json', ...init.headers },
  });
  const isJson = (res.headers.get('Content-Type') ?? '').includes('application/json');
  if (res.redirected || (!isJson && (res.status === 401 || res.status === 403))) {
    onAccessExpired();
    throw new ApiError(res.status, 'UNAUTHORIZED', 'Admin access expired');
  }
  const body: unknown = isJson ? await res.json().catch(() => null) : null;
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

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function query(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      if (value !== '') search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

const ok = z.object({ ok: z.literal(true) });

export const adminApi = {
  stats: () => adminRequest('/stats', adminStatsSchema),

  items: (q: AdminItemListQuery) => adminRequest(`/items${query(q)}`, adminItemListResponseSchema),
  item: (id: number) => adminRequest(`/items/${id}`, adminItemSchema),
  createItem: (body: AdminItemCreate) =>
    adminRequest('/items', adminItemSchema, json('POST', body)),
  patchItem: (id: number, body: AdminItemPatch) =>
    adminRequest(`/items/${id}`, adminItemSchema, json('PATCH', body)),
  deleteItem: (id: number) => adminRequest(`/items/${id}`, ok, { method: 'DELETE' }),
  preview: (id: number) => adminRequest(`/items/${id}/preview`, z.array(cardViewSchema)),

  trash: () => adminRequest('/trash', trashListResponseSchema),
  restore: (id: number) => adminRequest(`/trash/${id}/restore`, ok, json('POST', {})),
  purge: (id: number) => adminRequest(`/trash/${id}`, ok, json('DELETE', { confirm: 'PURGE' })),

  topics: () => adminRequest('/topics', adminTopicListSchema),
  createTopic: (body: { slug: string; name: string; nameHe?: string }) =>
    adminRequest('/topics', adminTopicSchema, json('POST', body)),
  patchTopic: (
    id: number,
    body: {
      slug?: string;
      name?: string;
      nameHe?: string;
      isActive?: boolean;
      excludesTopicId?: number | null;
    },
  ) => adminRequest(`/topics/${id}`, adminTopicSchema, json('PATCH', body)),
  deleteTopic: (id: number) => adminRequest(`/topics/${id}`, ok, { method: 'DELETE' }),
  reorderTopics: (ids: number[]) =>
    adminRequest('/topics/order', adminTopicListSchema, json('PUT', { ids })),

  languages: () => adminRequest('/languages', adminLanguageListSchema),
  setLanguageActive: (code: string, isActive: boolean) =>
    adminRequest(`/languages/${code}`, adminLanguageListSchema, json('PATCH', { isActive })),
  createLanguage: (body: LanguageCreate) =>
    adminRequest('/languages', adminLanguageListSchema, json('POST', body)),
  renameLanguage: (code: string, body: { name: string; nativeName: string }) =>
    adminRequest(`/languages/${code}`, adminLanguageListSchema, json('PATCH', body)),

  users: (q: { q?: string; cursor?: string }) =>
    adminRequest(`/users${query(q)}`, adminUserListResponseSchema),
  patchUser: (id: string, body: AdminUserPatch) =>
    adminRequest(`/users/${encodeURIComponent(id)}`, adminUserSchema, json('PATCH', body)),

  settings: () => adminRequest('/settings', settingsSchema),
  saveSettings: (body: SettingsUpdate) =>
    adminRequest('/settings', settingsSchema, json('PUT', body)),

  audit: (q: AuditQuery) => adminRequest(`/audit${query(q)}`, auditListResponseSchema),

  /** Multipart upload (the browser sets the boundary). */
  importCsv: (file: File, options: { dryRun: boolean; createMissingTopics: boolean }) => {
    const form = new FormData();
    form.append('file', file);
    return adminRequest(`/import${query(options)}`, importReportSchema, {
      method: 'POST',
      body: form,
    });
  },
};

/** The `details` of a validation error, as `{ path: message }`. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) return {};
  const out: Record<string, string> = {};
  for (const d of error.details as { path?: unknown; message?: unknown }[]) {
    if (typeof d.path === 'string' && typeof d.message === 'string') out[d.path] ??= d.message;
  }
  return out;
}

export function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  const fields = Object.values(fieldErrors(error));
  return fields.length > 0 ? `${error.message}: ${fields.join('; ')}` : error.message;
}
