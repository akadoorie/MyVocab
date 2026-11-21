import {
  availableQuerySchema,
  startLoopRequestSchema,
  type AvailableResponse,
  type MetaResponse,
  type RegisteredUsersResponse,
  type StartLoopResponse,
} from '@myvocab/contracts';
import { resolveStartDefaults } from '@myvocab/core';
import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { parseOrThrow, readJson } from '../lib/validate';
import { burstLimit, ipKey } from '../middleware/burst-limit';

/** Public endpoints (PRD §12.1). */
export const publicRoutes = new Hono<AppEnv>()
  .get('/meta', async (c) => {
    const { settings, languages, topics } = c.get('container');
    const [s, langs, cats] = await Promise.all([
      settings.get(),
      languages.listAll(),
      topics.listAll(),
    ]);
    const activeLangs = langs.filter((l) => l.isActive);
    const activeCats = cats.filter((x) => x.isActive);
    const defaults = resolveStartDefaults({
      settings: {
        defaults: {
          sourceLang: s['defaults.sourceLang'],
          targetLang: s['defaults.targetLang'],
          topicId: s['defaults.topicId'],
        },
        sizeOptions: s['loop.sizeOptions'],
        defaultSize: s['loop.defaultSize'],
        guestLoopSize: s['guests.loopSize'],
      },
      activeLanguages: activeLangs.map((l) => l.code),
      activeTopicIds: activeCats.map((x) => x.id),
      isGuest: false,
    });
    return c.json<MetaResponse>({
      languages: activeLangs.map(({ code, name, nativeName, dir }) => ({
        code,
        name,
        nativeName,
        dir,
      })),
      topics: activeCats.map(({ id, slug, name }) => ({ id, slug, name })),
      defaults,
      sizeOptions: s['loop.sizeOptions'],
      guest: { enabled: s['guests.enabled'], loopSize: s['guests.loopSize'] },
      undoWindowSeconds: s['undo.windowSeconds'],
      maintenance: { enabled: s['maintenance.enabled'], message: s['maintenance.message'] },
      turnstileSiteKey: c.get('config').TURNSTILE_SITE_KEY,
    });
  })
  .get('/stats/registered-users', async (c) => {
    const registeredUsers = await c.get('container').accounts.registeredUsers();
    return c.json<RegisteredUsersResponse>({ registeredUsers });
  })
  .get('/loops/available', burstLimit('RL_AVAILABLE', ipKey), async (c) => {
    const q = parseOrThrow(availableQuerySchema, c.req.query());
    const available = await c.get('container').loops.available(
      {
        source: q.source,
        target: q.target,
        topicId: q.topicId ?? null,
        sample: q.sample === 'true',
      },
      await c.get('requester')(),
    );
    return c.json<AvailableResponse>({ available });
  })
  .post('/loops', burstLimit('RL_LOOPS', ipKey), async (c) => {
    const body = parseOrThrow(startLoopRequestSchema, await readJson(c.req));
    const result = await c.get('container').loops.start(body, await c.get('requester')());
    return c.json<StartLoopResponse>(result);
  });
