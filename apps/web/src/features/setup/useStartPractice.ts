import type { MetaResponse } from '@myvocab/contracts';
import { createPractice, randomSeed, type StartChoices } from '@myvocab/core';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api, ApiError } from '../../lib/api';
import { RETRY_DELAYS_MS, retryState } from '../../lib/auto-reload';
import { ME_QUERY_KEY } from '../../lib/session';
import { strings, topicName } from '../../strings';
import { savePractice } from '../practice/practice-storage';
import { useTurnstile } from './useTurnstile';

export type PracticeStartNotice = { insufficient?: string };

/** `started`: on the way to the practice; `empty`: no new cards for these choices; `failed`: see `error`. */
export type StartResult = 'started' | 'empty' | 'failed';

function remainingOf(details: unknown): number {
  const remaining = (details as { remaining?: unknown } | undefined)?.remaining;
  return typeof remaining === 'number' ? remaining : 0;
}

/**
 * Starting a practice (PRD FR-L7–L10), shared by the start card and the summary's "New practice"
 * (which starts the next practice with the same choices, without going through the start card). For
 * guests it runs the invisible Turnstile check; render `containerRef` where an interactive
 * challenge may appear. `meta` may still be loading (`undefined`): `start` then reports a generic
 * error, so callers disable their button until it is there.
 */
export function useStartPractice({
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
      return await attempt(meta, choices, options, 0);
    } finally {
      setStarting(false);
    }
  }

  /**
   * One try. An unexpected failure ("Something went wrong") is retried on the D-092 timing: after
   * 1 second quietly, then twice 2 seconds apart with "Refreshing in 2 seconds", then the error.
   */
  async function attempt(
    meta: MetaResponse,
    choices: StartChoices,
    options: { replace?: boolean },
    tries: number,
  ): Promise<StartResult> {
    const retry = async (): Promise<StartResult> => {
      const state = retryState(tries);
      if (state === 'failed') {
        setError(strings.setup.genericError);
        return 'failed';
      }
      setError(state === 'retrying' ? strings.setup.genericRetrying : null);
      await new Promise((resolve) => window.setTimeout(resolve, RETRY_DELAYS_MS[tries]));
      return attempt(meta, choices, options, tries + 1);
    };
    try {
      const turnstileToken = isGuest ? await getToken() : undefined;
      const res = await api.startPractice({
        source: choices.sourceLang,
        target: choices.targetLang,
        topicId: choices.topicId,
        ...(isGuest ? {} : { size: choices.size }),
        ...(choices.sample && !isGuest ? { sample: true } : {}),
        ...(turnstileToken ? { turnstileToken } : {}),
      });
      if (res.cards.length === 0) return 'empty';
      savePractice({
        cards: res.cards,
        state: createPractice(
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
      const notice: PracticeStartNotice =
        res.returned < res.requested
          ? { insufficient: strings.practice.insufficient(res.returned, topicLabel) }
          : {};
      setError(null);
      navigate('/practice', { state: notice, replace: options.replace ?? false });
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
      else if (e instanceof Error && e.message.startsWith('Turnstile'))
        setError(strings.setup.botCheckFailed);
      else return retry();
      return 'failed';
    }
  }

  return { start, starting, error, setError, containerRef };
}
