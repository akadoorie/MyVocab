import {
  adminItemCreateSchema,
  adminItemListQuerySchema,
  adminItemPatchSchema,
  adminUserListQuerySchema,
  adminUserPatchSchema,
  auditQuerySchema,
  categoryCreateSchema,
  categoryOrderSchema,
  categoryPatchSchema,
  langCodeSchema,
  languagePatchSchema,
  purgeRequestSchema,
  settingsUpdateSchema,
} from '@myvocab/contracts';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app';
import { parseOrThrow, readJson } from '../lib/validate';
import { requireAdmin } from '../middleware/require-admin';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const userIdParam = z.object({ id: z.string().min(1).max(200) });
const codeParam = z.object({ code: langCodeSchema });

/**
 * Admin API (PRD §12.4): both locks on every route (requireAdmin), strict input schemas, and an
 * audit entry in the same D1 batch as every change. No endpoint exports the database.
 */
export const adminRoutes = new Hono<AppEnv>()
  .use('*', requireAdmin)

  .get('/stats', async (c) => c.json(await c.get('container').admin.ops.stats()))

  // Items
  .get('/items', async (c) => {
    const filter = parseOrThrow(adminItemListQuerySchema, c.req.query());
    return c.json(await c.get('container').admin.items.list(filter));
  })
  .post('/items', async (c) => {
    const body = parseOrThrow(adminItemCreateSchema, await readJson(c.req));
    return c.json(await c.get('container').admin.items.create(body, c.get('actor')), 201);
  })
  .get('/items/:id', async (c) => {
    const { id } = parseOrThrow(idParam, c.req.param());
    return c.json(await c.get('container').admin.items.get(id));
  })
  .patch('/items/:id', async (c) => {
    const { id } = parseOrThrow(idParam, c.req.param());
    const body = parseOrThrow(adminItemPatchSchema, await readJson(c.req));
    return c.json(await c.get('container').admin.items.update(id, body, c.get('actor')));
  })
  .delete('/items/:id', async (c) => {
    const { id } = parseOrThrow(idParam, c.req.param());
    await c.get('container').admin.items.trash(id, c.get('actor'));
    return c.json({ ok: true as const });
  })
  .get('/items/:id/preview', async (c) => {
    const { id } = parseOrThrow(idParam, c.req.param());
    return c.json(await c.get('container').admin.items.preview(id));
  })

  // Trash
  .get('/trash', async (c) => c.json(await c.get('container').admin.items.listTrash()))
  .post('/trash/:id/restore', async (c) => {
    const { id } = parseOrThrow(idParam, c.req.param());
    await c.get('container').admin.items.restore(id, c.get('actor'));
    return c.json({ ok: true as const });
  })
  .delete('/trash/:id', async (c) => {
    const { id } = parseOrThrow(idParam, c.req.param());
    parseOrThrow(purgeRequestSchema, await readJson(c.req));
    await c.get('container').admin.items.purge(id, c.get('actor'));
    return c.json({ ok: true as const });
  })

  // Categories
  .get('/categories', async (c) =>
    c.json({ categories: await c.get('container').admin.catalog.listCategories() }),
  )
  .post('/categories', async (c) => {
    const body = parseOrThrow(categoryCreateSchema, await readJson(c.req));
    return c.json(await c.get('container').admin.catalog.createCategory(body, c.get('actor')), 201);
  })
  .put('/categories/order', async (c) => {
    const { ids } = parseOrThrow(categoryOrderSchema, await readJson(c.req));
    return c.json({
      categories: await c.get('container').admin.catalog.reorderCategories(ids, c.get('actor')),
    });
  })
  .patch('/categories/:id', async (c) => {
    const { id } = parseOrThrow(idParam, c.req.param());
    const body = parseOrThrow(categoryPatchSchema, await readJson(c.req));
    return c.json(await c.get('container').admin.catalog.updateCategory(id, body, c.get('actor')));
  })
  .delete('/categories/:id', async (c) => {
    const { id } = parseOrThrow(idParam, c.req.param());
    await c.get('container').admin.catalog.deleteCategory(id, c.get('actor'));
    return c.json({ ok: true as const });
  })

  // Languages
  .get('/languages', async (c) =>
    c.json({ languages: await c.get('container').admin.catalog.listLanguages() }),
  )
  .patch('/languages/:code', async (c) => {
    const { code } = parseOrThrow(codeParam, c.req.param());
    const { isActive } = parseOrThrow(languagePatchSchema, await readJson(c.req));
    return c.json({
      languages: await c
        .get('container')
        .admin.catalog.setLanguageActive(code, isActive, c.get('actor')),
    });
  })

  // Users
  .get('/users', async (c) => {
    const q = parseOrThrow(adminUserListQuerySchema, c.req.query());
    return c.json(await c.get('container').admin.users.list(q.q, q.cursor));
  })
  .patch('/users/:id', async (c) => {
    const { id } = parseOrThrow(userIdParam, c.req.param());
    const body = parseOrThrow(adminUserPatchSchema, await readJson(c.req));
    return c.json(await c.get('container').admin.users.update(id, body, c.get('actor')));
  })

  // Settings
  .get('/settings', async (c) => c.json(await c.get('container').admin.ops.getSettings()))
  .put('/settings', async (c) => {
    const body = parseOrThrow(settingsUpdateSchema, await readJson(c.req));
    return c.json(await c.get('container').admin.ops.updateSettings(body, c.get('actor')));
  })

  // Audit log (read-only: there is no endpoint to change or delete entries)
  .get('/audit', async (c) => {
    const q = parseOrThrow(auditQuerySchema, c.req.query());
    return c.json(await c.get('container').admin.ops.audit(q));
  });
