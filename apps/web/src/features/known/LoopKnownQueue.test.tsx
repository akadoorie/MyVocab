import { createLoop } from '@myvocab/core';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ME_QUERY_KEY } from '../../lib/session';
import { makeCard } from '../../test/fixtures';
import { mockFetch, renderRoutes, TEST_USER } from '../../test/render';
import { saveLoop } from '../loop/loop-storage';
import { LoopPage } from '../loop/LoopPage';
import { queueStorageKey } from './known-queue';
import { KnownQueueProvider } from './KnownQueueProvider';

/** The loop screen + the real Know queue (PRD §6.4): what ends up in the persistent queue. */
function setup(isGuest: boolean) {
  saveLoop({
    cards: [makeCard(1), makeCard(2)],
    state: createLoop([1, 2], 7),
    undoWindowSeconds: 4,
    selection: { sourceLang: 'en', targetLang: 'he', categoryId: null, type: 'word', size: 10 },
    isGuest,
  });
  mockFetch({ 'POST /api/me/known': () => Response.json({ saved: 1 }) });
  return renderRoutes(
    [
      { path: '/loop', element: <LoopPage /> },
      { path: '/', element: <p>home page</p> },
    ],
    ['/loop'],
    (tree) => <KnownQueueProvider>{tree}</KnownQueueProvider>,
  );
}

const stored = () =>
  JSON.parse(window.localStorage.getItem(queueStorageKey(TEST_USER.id)) ?? '[]') as {
    i: number;
    t: string;
    c: number;
  }[];

const firstCardId = () =>
  Number(
    (screen.getByTestId('flip-card').textContent ?? '').match(/sample-(\d+)/)?.[1] ?? Number.NaN,
  );

const button = (name: string) => screen.getAllByRole('button', { name }).at(-1)!;

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe('Know marks of a signed-in learner', () => {
  it('Know queues {itemId, target, cycle} (ids only) and Undo removes it', async () => {
    const { client } = setup(false);
    // The queue exists once the session is known.
    await waitFor(() => expect(client.getQueryData(ME_QUERY_KEY)).toEqual({ user: TEST_USER }));
    await act(async () => {});
    const id = firstCardId();
    fireEvent.click(button('Know'));
    expect(stored()).toEqual([{ i: id, t: 'he', c: 1, f: 0, n: expect.any(Number) as number }]);
    expect(window.localStorage.getItem(queueStorageKey(TEST_USER.id))).not.toMatch(/sample/);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(stored()).toEqual([]);
  });

  it('guests queue nothing (FR-L55)', async () => {
    setup(true);
    await screen.findByTestId('flip-card');
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    fireEvent.click(button('Know'));
    expect(window.localStorage.length).toBe(0);
  });
});
