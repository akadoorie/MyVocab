import { createLoop } from '@myvocab/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/Toast';
import { makeCard } from '../../test/fixtures';
import { mockFetch } from '../../test/render';
import { loadLoop, saveLoop } from './loop-storage';
import { LoopPage, type KnownSink } from './LoopPage';

const CARDS = [makeCard(1), makeCard(2), makeCard(3)];

function setup(
  sink?: KnownSink,
  {
    isGuest = true,
    routes = {},
  }: { isGuest?: boolean; routes?: Parameters<typeof mockFetch>[0] } = {},
) {
  // /api/me answers with a signed-in learner, /api/meta with the test settings.
  const fetchSpy = mockFetch(routes);
  saveLoop({
    cards: CARDS,
    state: createLoop([1, 2, 3], 42),
    undoWindowSeconds: 4,
    selection: { sourceLang: 'en', targetLang: 'he', categoryId: null, type: 'word', size: 5 },
    isGuest,
  });
  const router = createMemoryRouter(
    [
      { path: '/loop', element: <LoopPage {...(sink ? { knownSink: sink } : {})} /> },
      { path: '/', element: <p>home page</p> },
    ],
    { initialEntries: ['/loop'] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return Object.assign(router, { fetchSpy });
}

const btn = (name: string) => {
  const all = screen.getAllByRole('button', { name });
  return all[all.length - 1] as HTMLElement;
};
const progress = () => screen.getByTestId('progress').textContent;
const side = () => screen.getByTestId('flip-card').getAttribute('data-side');

beforeEach(() => window.sessionStorage.clear());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('LoopPage', () => {
  it('starts on the front with Next disabled and the decision buttons enabled', () => {
    setup();
    expect(progress()).toBe('Cycle 1 · Card 1/3 · 0 known');
    expect(side()).toBe('front');
    expect(btn('Next')).toBeDisabled();
    for (const name of [
      'I know it Done for this session',
      'I don’t know Show again soon',
      'Hints',
      'Flip',
    ])
      expect(btn(name)).toBeEnabled();
  });

  it('Don’t know flips to the back, keeps the layout, turns the answers off and Next pumps', () => {
    setup();
    fireEvent.click(btn('I don’t know Show again soon'));
    expect(side()).toBe('back');
    // The answers stay in place, disabled; Next is the way on.
    for (const name of [
      'I know it Done for this session',
      'I know it Show again in future (sign-in to use)',
      'I don’t know Show again soon',
    ])
      expect(btn(name)).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Next' })).toHaveLength(1);
    expect(btn('Next')).toHaveClass('is-urgent');
    expect(btn('Next')).toBeEnabled();
    expect(document.activeElement).toBe(btn('Next'));
    expect(btn('Hints')).toBeDisabled(); // only while the front shows
    fireEvent.click(btn('Flip'));
    expect(btn('Hints')).toBeEnabled();
  });

  it('Hints is a toggle: on (pressed, hints shown), then off (back to before)', () => {
    setup();
    const front = () => screen.queryByTestId('front-hints');
    expect(front()).toBeNull();
    fireEvent.click(btn('Hints'));
    expect(btn('Hints')).toHaveAttribute('aria-pressed', 'true');
    expect(btn('Hints')).toBeEnabled();
    expect(front()).not.toBeNull();
    fireEvent.click(btn('Hints'));
    expect(btn('Hints')).toHaveAttribute('aria-pressed', 'false');
    expect(front()).toBeNull();
    fireEvent.keyDown(window, { key: 'h' });
    expect(front()).not.toBeNull();
  });

  it('Back shows the previous card front side up with its answer; Next steps forward again', () => {
    setup();
    expect(btn('Back')).toBeDisabled(); // first card of the cycle
    fireEvent.click(btn('I know it Done for this session'));
    fireEvent.click(btn('I don’t know Show again soon'));
    expect(side()).toBe('back');
    fireEvent.click(btn('Back'));
    expect(progress()).toBe('Cycle 1 · Card 1/3 · 1 known');
    expect(side()).toBe('front');
    expect(screen.getByTestId('answer-chip')).toHaveTextContent('Your answer: I know it');
    expect(screen.getByText('Card 1 of 3. Your answer: I know it')).toHaveClass('sr-only');
    expect(btn('Next')).toBeEnabled(); // answered, so Next skips ahead without answering again
    fireEvent.click(btn('Next'));
    expect(progress()).toBe('Cycle 1 · Card 2/3 · 1 known');
    expect(side()).toBe('front'); // even though it was showing its back when we left it
    expect(screen.getByTestId('answer-chip')).toHaveTextContent('Your answer: I don’t know');
    fireEvent.click(btn('Next'));
    expect(screen.queryByTestId('answer-chip')).not.toBeInTheDocument(); // not answered yet
    expect(btn('Next')).toBeDisabled();
  });

  it('changing an answer: Know → Don’t know unmarks it, Don’t know → Know marks it', () => {
    const sink = { onKnow: vi.fn(), onUnknow: vi.fn() };
    setup(sink);
    fireEvent.click(btn('I know it Done for this session'));
    expect(sink.onKnow).toHaveBeenCalledTimes(1);
    expect(sink.onKnow).toHaveBeenCalledWith(expect.objectContaining({ cycle: 1 }), 'he');
    fireEvent.click(btn('Back'));
    fireEvent.click(btn('I don’t know Show again soon'));
    expect(sink.onUnknow).toHaveBeenCalledTimes(1);
    expect(progress()).toBe('Cycle 1 · Card 1/3 · 0 known');
    expect(side()).toBe('back');
    fireEvent.click(btn('Next'));
    fireEvent.click(btn('Back'));
    fireEvent.click(btn('I know it Done for this session'));
    expect(sink.onKnow).toHaveBeenCalledTimes(2);
    expect(progress()).toBe('Cycle 1 · Card 2/3 · 1 known');
    // Know again on a card already known changes nothing in the queue.
    fireEvent.click(btn('Back'));
    fireEvent.click(btn('I know it Done for this session'));
    expect(sink.onKnow).toHaveBeenCalledTimes(2);
  });

  it('guests see all three answers, the orange one greyed out and off; A does nothing (D-030)', () => {
    setup();
    expect(btn('I know it Done for this session')).toBeEnabled();
    expect(screen.getByText('Done for this session')).toBeInTheDocument();
    const again = btn('I know it Show again in future (sign-in to use)');
    expect(again).toBeDisabled();
    expect(again).toHaveClass('lbtn--again', 'is-locked');
    expect(again).toHaveAttribute('title', 'Sign-in to use this');
    expect(screen.getByText('Show again in future')).toBeInTheDocument();
    expect(screen.getByText('Show again soon')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'a' });
    expect(progress()).toBe('Cycle 1 · Card 1/3 · 0 known');
  });

  it('signed-in: Know (forever), Know (ask again), Don’t know; ask again is never recorded', () => {
    const sink = { onKnow: vi.fn(), onUnknow: vi.fn() };
    setup(sink, { isGuest: false });
    const names = screen
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent)
      .filter((n) => /know/i.test(n ?? ''));
    expect(names).toEqual([
      'I know it Don’t show again',
      'I know it Show again in future',
      'I don’t know Show again soon',
    ]);
    expect(btn('I know it Show again in future')).toHaveClass('lbtn--again');
    expect(btn('I know it Show again in future')).not.toHaveClass('is-locked');
    expect(screen.getByText('Don’t show again')).toBeInTheDocument();
    expect(screen.getByText('Show again in future')).toBeInTheDocument();
    expect(screen.getByText('Show again soon')).toBeInTheDocument();

    fireEvent.click(btn('I know it Show again in future'));
    expect(progress()).toBe('Cycle 1 · Card 2/3 · 1 known'); // counts like Know in the session
    expect(sink.onKnow).not.toHaveBeenCalled();
    expect(loadLoop()?.state.known[0]?.again).toBe(true); // a refresh keeps it
    fireEvent.click(btn('Back'));
    expect(screen.getByTestId('answer-chip')).toHaveTextContent(
      'Your answer: I know it (show again in future)',
    );
    expect(
      screen.getByText('Card 1 of 3. Your answer: I know it (show again in future)'),
    ).toHaveClass('sr-only');

    fireEvent.keyDown(window, { key: 'a' }); // the same answer: nothing changes
    expect(sink.onKnow).not.toHaveBeenCalled();
    expect(sink.onUnknow).not.toHaveBeenCalled();
  });

  it('signed-in: switching between the two Knows records and unrecords the word', () => {
    const sink = { onKnow: vi.fn(), onUnknow: vi.fn() };
    setup(sink, { isGuest: false });
    fireEvent.click(btn('I know it Don’t show again'));
    expect(sink.onKnow).toHaveBeenCalledTimes(1);
    fireEvent.click(btn('Back'));
    fireEvent.click(btn('I know it Show again in future'));
    expect(sink.onUnknow).toHaveBeenCalledWith(sink.onKnow.mock.calls[0]![0].id, 'he');
    expect(progress()).toBe('Cycle 1 · Card 2/3 · 1 known');
    fireEvent.click(btn('Back'));
    fireEvent.click(btn('I know it Don’t show again'));
    expect(sink.onKnow).toHaveBeenCalledTimes(2);
    fireEvent.click(btn('Back'));
    fireEvent.click(btn('I know it Show again in future'));
    fireEvent.click(btn('Back'));
    fireEvent.click(btn('I don’t know Show again soon')); // from ask again: nothing was recorded, nothing to undo
    expect(sink.onUnknow).toHaveBeenCalledTimes(2);
    expect(sink.onKnow).toHaveBeenCalledTimes(2);
  });

  it('← and → are Back and Next', () => {
    setup();
    fireEvent.keyDown(window, { key: 'k' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(progress()).toBe('Cycle 1 · Card 1/3 · 1 known');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(progress()).toBe('Cycle 1 · Card 2/3 · 1 known');
  });

  it('Session completed plays the applause; the sound switch turns it off and is remembered', () => {
    window.localStorage.clear();
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementation(() => Promise.resolve());
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    setup();
    for (let i = 0; i < 3; i++) fireEvent.click(btn('I know it Done for this session'));
    expect(play).toHaveBeenCalledTimes(1);
    const toggle = screen.getByRole('button', { name: /Sound on/ });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(toggle);
    expect(pause).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Sound off/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(window.localStorage.getItem('myvocab.sound.v1')).toBe('false');
    vi.restoreAllMocks();
  });

  it('celebrates once: after Back and Next the summary returns without sound, crown still there', () => {
    window.localStorage.clear();
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    setup();
    for (let i = 0; i < 3; i++) fireEvent.click(btn('I know it Done for this session'));
    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('crown')).toBeInTheDocument(); // reduced motion here: no flight
    fireEvent.click(screen.getByRole('button', { name: /Back to the last card/ }));
    expect(loadLoop()?.celebrated).toBe(true); // survives a refresh too
    fireEvent.click(btn('Next'));
    expect(screen.getByRole('heading', { name: 'Session completed' })).toBeInTheDocument();
    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('crown')).toBeInTheDocument();
    expect(screen.queryByTestId('confetti')).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('celebrates again when a new cycle was started after the celebration', () => {
    window.localStorage.clear();
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    setup();
    for (let i = 0; i < 3; i++) fireEvent.click(btn('I know it Done for this session'));
    expect(play).toHaveBeenCalledTimes(1);
    // Back, change the last card to Don't know, then Back to Know again: no new cycle, no repeat.
    fireEvent.click(screen.getByRole('button', { name: /Back to the last card/ }));
    fireEvent.click(btn('I don’t know Show again soon'));
    fireEvent.click(btn('Back')); // to card 2
    fireEvent.click(btn('Next')); // card 3 again, answered Don't know
    fireEvent.click(btn('I know it Done for this session')); // changed back: the session is completed again
    expect(screen.getByRole('heading', { name: 'Session completed' })).toBeInTheDocument();
    expect(play).toHaveBeenCalledTimes(1);
    // Now a real new cycle: Back, Don't know, Next → cycle break → Continue → Know → completed.
    fireEvent.click(screen.getByRole('button', { name: /Back to the last card/ }));
    fireEvent.click(btn('I don’t know Show again soon'));
    fireEvent.click(btn('Next'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(btn('I know it Done for this session'));
    expect(screen.getByRole('heading', { name: 'Session completed' })).toBeInTheDocument();
    expect(play).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });

  it('the cycle break and the summary go back to the last card', () => {
    setup();
    fireEvent.click(btn('I know it Done for this session'));
    fireEvent.click(btn('I know it Done for this session'));
    fireEvent.click(btn('I know it Done for this session'));
    expect(screen.getByRole('heading', { name: 'Session completed' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Back to the last card/ }));
    expect(progress()).toBe('Cycle 1 · Card 3/3 · 3 known');
    expect(loadLoop()).not.toBeNull(); // the session is alive again
    fireEvent.click(btn('I don’t know Show again soon'));
    fireEvent.click(btn('Next'));
    expect(screen.getByRole('heading', { name: 'Cycle 2 · 1 card left' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Back to the last card/ }));
    expect(progress()).toBe('Cycle 1 · Card 3/3 · 2 known');
  });

  it('supports keyboard shortcuts', () => {
    setup();
    fireEvent.keyDown(window, { key: 'h' });
    expect(screen.getByTestId('front-hints')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'f' });
    expect(side()).toBe('back');
    fireEvent.keyDown(window, { key: ' ' });
    expect(side()).toBe('front');
    fireEvent.keyDown(window, { key: 'd' });
    expect(side()).toBe('back');
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(progress()).toBe('Cycle 1 · Card 2/3 · 0 known');
    fireEvent.keyDown(window, { key: 'k' });
    expect(progress()).toBe('Cycle 1 · Card 3/3 · 1 known');
  });

  it('reaches a cycle break, continues, and ends with a summary', () => {
    setup();
    fireEvent.click(btn('I know it Done for this session'));
    fireEvent.click(btn('I know it Done for this session'));
    fireEvent.click(btn('I don’t know Show again soon'));
    fireEvent.click(btn('Next'));
    expect(screen.getByRole('heading', { name: 'Cycle 2 · 1 card left' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(progress()).toBe('Cycle 2 · Card 1/1 · 2 known');
    fireEvent.click(btn('I know it Done for this session'));
    const summary = screen
      .getByRole('heading', { name: 'Session completed' })
      .closest('section') as HTMLElement;
    expect(within(summary).getByText('Already knew').nextSibling).toHaveTextContent('2');
    expect(within(summary).getByText('Learned here').nextSibling).toHaveTextContent('1');
    expect(loadLoop()).toBeNull(); // finishing clears the saved loop
  });

  describe('New session on the summary (FR-L32)', () => {
    const finish = () => {
      // Signed-in learners have two Knows; the green one is recorded.
      for (let i = 0; i < 3; i++) fireEvent.click(btn('I know it Don’t show again'));
      expect(screen.getByRole('heading', { name: 'Session completed' })).toBeInTheDocument();
    };

    it('starts the next session right away with the same choices', async () => {
      const posted: unknown[] = [];
      const router = setup(undefined, {
        isGuest: false,
        routes: {
          'POST /api/loops': (init) => {
            posted.push(JSON.parse(String(init?.body)));
            return Response.json({ requested: 5, returned: 2, cards: [makeCard(7), makeCard(8)] });
          },
        },
      });
      finish();
      const newSession = screen.getByRole('button', { name: 'New session' });
      await waitFor(() => expect(newSession).toBeEnabled()); // once the settings have loaded
      fireEvent.click(newSession);
      await waitFor(() => expect(progress()).toBe('Cycle 1 · Card 1/2 · 0 known'));
      expect(posted).toEqual([
        { source: 'en', target: 'he', type: 'word', categoryId: null, size: 5 },
      ]);
      expect(router.state.location.pathname).toBe('/loop');
      expect(loadLoop()?.cards.map((c) => c.itemId)).toEqual([7, 8]);
      expect(loadLoop()?.selection).toMatchObject({ sourceLang: 'en', targetLang: 'he' });
      expect(await screen.findByText('Only 2 new cards in General, starting with 2')).toBeVisible();
    });

    it('says so when no new cards are left, and Home still works', async () => {
      const router = setup(undefined, {
        isGuest: false,
        routes: {
          'POST /api/loops': () => Response.json({ requested: 5, returned: 0, cards: [] }),
        },
      });
      finish();
      const newSession = screen.getByRole('button', { name: 'New session' });
      await waitFor(() => expect(newSession).toBeEnabled()); // once the settings have loaded
      fireEvent.click(newSession);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'No new cards left for these choices. Go Home to pick others.',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Home' }));
      await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    });

    it('shows why it could not start (e.g. the daily limit)', async () => {
      setup(undefined, {
        isGuest: false,
        routes: {
          'POST /api/loops': () =>
            Response.json(
              { error: { code: 'RATE_LIMITED', message: 'limit', details: { remaining: 3 } } },
              { status: 429 },
            ),
        },
      });
      finish();
      const newSession = screen.getByRole('button', { name: 'New session' });
      await waitFor(() => expect(newSession).toBeEnabled()); // once the settings have loaded
      fireEvent.click(newSession);
      expect(await screen.findByRole('alert')).toHaveTextContent(/You can still get 3 cards today/);
      expect(screen.getByRole('heading', { name: 'Session completed' })).toBeInTheDocument();
    });
  });

  it('saves progress so a refresh resumes; Stop asks, then clears it and goes home', async () => {
    const router = setup();
    fireEvent.click(btn('I know it Done for this session'));
    expect(loadLoop()?.state.index).toBe(1);
    fireEvent.click(screen.getAllByRole('button', { name: /Stop/ })[0] as HTMLElement);
    // Stop asks first, like Home; No keeps the session.
    const dialog = screen.getByRole('dialog', { name: 'Stop the session?' });
    expect(dialog).toHaveTextContent('This will stop the session. Are you sure?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'No' }));
    expect(loadLoop()).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' }); // Esc = Stop, which asks too
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Yes' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(loadLoop()).toBeNull();
  });

  it('the Keyboard shortcuts popover lists the keys, and Esc closes it without stopping', () => {
    setup();
    const toggle = screen.getByRole('button', { name: 'Keyboard shortcuts' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Next / Continue')).toBeInTheDocument();
    fireEvent.keyDown(toggle, { key: 'Escape' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(loadLoop()).not.toBeNull(); // still in the loop
  });

  it('Home asks first: No keeps the loop (shortcuts paused meanwhile), Yes stops it', async () => {
    const router = setup();
    fireEvent.click(screen.getByRole('button', { name: /Home/ }));
    const dialog = screen.getByRole('dialog', { name: 'Back to Home?' });
    expect(dialog).toHaveTextContent('This will stop the session. Are you sure?');
    fireEvent.keyDown(window, { key: 'k' }); // ignored while the question is open
    expect(progress()).toBe('Cycle 1 · Card 1/3 · 0 known');
    fireEvent.click(within(dialog).getByRole('button', { name: 'No' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/loop');
    expect(loadLoop()).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Home/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Yes' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(loadLoop()).toBeNull();
  });

  it('redirects home when there is no loop to resume', async () => {
    const router = createMemoryRouter(
      [
        { path: '/loop', element: <LoopPage /> },
        { path: '/', element: <p>home page</p> },
      ],
      { initialEntries: ['/loop'] },
    );
    mockFetch({});
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('home page')).toBeInTheDocument();
  });
});
