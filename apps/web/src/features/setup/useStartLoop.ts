import type { MetaResponse } from '@myvocab/contracts';
import { createLoop, randomSeed, type StartChoices } from '@myvocab/core';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api, ApiError } from '../../lib/api';
import { ME_QUERY_KEY } from '../../lib/session';
import { strings, topicName } from '../../strings';
import { saveLoop } from '../loop/loop-storage';
import { useTurnstile } from './useTurnstile';

export type LoopStartNotice = { insufficient?: string };

/** `started`: on the way to the loop; `empty`: no new cards for these choices; `failed`: see `error`. */
export type StartResult = 'started' | 'empty' | 'failed';

function remainingOf(details: unknown): number {
  const remaining = (details as { remaining?: unknown } | undefined)?.remaining;
  return typeof remaining === 'number' ? remaining : 0;
}

/**
 * Starting a loop (PRD FR-L7–L10), shared by the start card and the summary's "New session"
 * (which starts the next loop with the same choices, without going through the start card). For
 * guests it runs the invisible Turnstile check; render `containerRef` where an interactive
 * challenge may appear. `meta` may still be loading (`undefined`): `start` then reports a generic
 * error, so callers disable their button until it is there.
 */
export function useStartLoop({
  meta,
  isGuest,
}: {
  meta: MetaResponse | undefined;
  isGuest: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { containerRef, getToken } = useTurnstile(
    meta?.turnstileSiteKey,
    isGuest && (meta?.guest.enabled ?? false),
  );
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(
    choices: StartChoices,
    options: { replace?: boolean } = {},
  ): Promise<StartResult> {
    if (!meta) {
      setError(strings.setup.genericError);
      return 'failed';
    }
    setStarting(true);
    setError(null);
    try {
      const turnstileToken = isGuest ? await getToken() : undefined;
      const res = await api.startLoop({
        source: choices.sourceLang,
        target: choices.targetLang,
        topicId: choices.topicId,
        ...(isGuest ? {} : { size: choices.size }),
        ...(choices.sample && !isGuest ? { sample: true } : {}),
        ...(turnstileToken ? { turnstileToken } : {}),
      });
      if (res.cards.length === 0) return 'empty';
      saveLoop({
        cards: res.cards,
        state: createLoop(
          res.cards.map((c) => c.itemId),
          randomSeed(),
        ),
        undoWindowSeconds: meta.undoWindowSeconds,
        continueSeconds: meta.continueSeconds,
        nextSeconds: meta.nextSeconds,
        selection: choices,
        isGuest,
      });
      const topicLabel =
        isGuest || choices.sample
          ? strings.setup.sampleSet
          : choices.topicId === null
            ? strings.setup.general
            : (() => {
                const topic = meta.topics.find((c) => c.id === choices.topicId);
                return topic ? topicName(topic) : strings.setup.general;
              })();
      const notice: LoopStartNotice =
        res.returned < res.requested
          ? { insufficient: strings.loop.insufficient(res.returned, topicLabel) }
          : {};
      navigate('/loop', { state: notice, replace: options.replace ?? false });
      return 'started';
    } catch (e) {
      if (e instanceof ApiError && e.code === 'BOT_CHECK_FAILED')
        setError(strings.setup.botCheckFailed);
      else if (e instanceof ApiError && e.code === 'RATE_LIMITED' && !isGuest)
        setError(strings.setup.dailyCap(remainingOf(e.details)));
      else if (e instanceof ApiError && e.code === 'UNAUTHORIZED' && !isGuest) {
        setError(strings.setup.sessionExpired);
        void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      } else if (e instanceof ApiError && e.code === 'RATE_LIMITED')
        setError(strings.setup.guestRateLimited);
      else if (e instanceof ApiError && e.code === 'UNAUTHORIZED')
        setError(strings.setup.guestsDisabled);
      // Maintenance: the admin's own message (written in any language), or ours.
      else if (e instanceof ApiError && e.code === 'FORBIDDEN')
        setError(meta.maintenance.message || strings.nav.maintenance);
      else if (e instanceof ApiError) setError(strings.setup.genericError);
      else if (e instanceof Error && e.message.startsWith('Turnstile'))
        setError(strings.setup.botCheckFailed);
      else setError(strings.setup.genericError);
      return 'failed';
    } finally {
      setStarting(false);
    }
  }

  return { start, starting, error, setError, containerRef };
}
