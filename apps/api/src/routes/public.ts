import {
  availableByTopicQuerySchema,
  availableQuerySchema,
  startPracticeRequestSchema,
  type AvailableByTopicResponse,
  type AvailableResponse,
  type MetaResponse,
  type RegisteredUsersResponse,
  type StartPracticeResponse,
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
        sizeOptions: s['practice.sizeOptions'],
        defaultSize: s['practice.defaultSize'],
        guestPracticeSize: s['guests.practiceSize'],
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
      topics: activeCats.map(({ id, slug, name, nameHe }) => ({ id, slug, name, nameHe })),
      defaults,
      sizeOptions: s['practice.sizeOptions'],
      guest: { enabled: s['guests.enabled'], practiceSize: s['guests.practiceSize'] },
      undoWindowSeconds: s['undo.windowSeconds'],
      continueSeconds: s['practice.continueSeconds'],
      nextSeconds: s['practice.nextSeconds'],
      maintenance: { enabled: s['maintenance.enabled'], message: s['maintenance.message'] },
      turnstileSiteKey: c.get('config').TURNSTILE_SITE_KEY,
    });
  })
  .get('/stats/registered-users', async (c) => {
    const registeredUsers = await c.get('container').accounts.registeredUsers();
    return c.json<RegisteredUsersResponse>({ registeredUsers });
  })
  .get('/practices/available', burstLimit('RL_AVAILABLE', ipKey), async (c) => {
    const q = parseOrThrow(availableQuerySchema, c.req.query());
    const available = await c.get('container').practices.available(
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
  .get('/practices/available-by-topic', burstLimit('RL_AVAILABLE', ipKey), async (c) => {
    const q = parseOrThrow(availableByTopicQuerySchema, c.req.query());
    const counts = await c
      .get('container')
      .practices.availableByTopic(q, await c.get('requester')());
    return c.json<AvailableByTopicResponse>(counts);
  })
  .post('/practices', burstLimit('RL_PRACTICES', ipKey), async (c) => {
    const body = parseOrThrow(startPracticeRequestSchema, await readJson(c.req));
    const result = await c.get('container').practices.start(body, await c.get('requester')());
    return c.json<StartPracticeResponse>(result);
  });
