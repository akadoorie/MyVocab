import { createPractice } from '@myvocab/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/Toast';
import { makeCard } from '../../test/fixtures';
import { mockFetch } from '../../test/render';
import { loadPractice, savePractice } from './practice-storage';
import { PracticePage, type KnownSink } from './PracticePage';

const CARDS = [makeCard(1), makeCard(2), makeCard(3)];

function setup(
  sink?: KnownSink,
  {
    isGuest = true,
    routes = {},
    count = CARDS.length,
    continueSeconds,
    nextSeconds,
  }: {
    isGuest?: boolean;
    routes?: Parameters<typeof mockFetch>[0];
    count?: number;
    continueSeconds?: number;
    nextSeconds?: number;
  } = {},
) {
  // /api/me answers with a signed-in learner, /api/meta with the test settings.
  const fetchSpy = mockFetch(routes);
  const ids = Array.from({ length: count }, (_, i) => i + 1);
  savePractice({
    cards: ids.map((n) => makeCard(n)),
    state: createPractice(ids, 42),
    undoWindowSeconds: 4,
    selection: { sourceLang: 'en', targetLang: 'he', topicId: null, size: 5 },
    isGuest,
    ...(continueSeconds === undefined ? {} : { continueSeconds }),
    ...(nextSeconds === undefined ? {} : { nextSeconds }),
  });
  const router = createMemoryRouter(
    [
      { path: '/practice', element: <PracticePage {...(sink ? { knownSink: sink } : {})} /> },
      { path: '/', element: <p>home page</p> },
    ],
    { initialEntries: ['/practice'] },
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

describe('PracticePage', () => {
  it('starts on the front with Next disabled and the decision buttons enabled', () => {
    setup();
    expect(progress()).toBe('Round 1 · Card 1/3 · 0 known');
    expect(side()).toBe('front');
    expect(btn('Next')).toBeDisabled();
    for (const name of [
      'I know Show in future',
      'I don’t know Show in next round',
      'Tap to see hints', // the live cover over the hints on the card (D-047)
      'Flip',
    ])
      expect(btn(name)).toBeEnabled();
  });

  it('the language switch is there throughout the loop: on the card and at the round break (D-122)', () => {
    setup();
    expect(screen.getByTestId('language-switch')).toBeInTheDocument();
    for (let i = 0; i < 3; i++) {
      fireEvent.click(btn('I don’t know Show in next round'));
      fireEvent.click(btn('Next'));
    }
    expect(screen.getByTestId('continue')).toBeInTheDocument(); // the round break
    expect(screen.getByTestId('language-switch')).toBeInTheDocument();
  });

  it('the round bar: one segment per card, answers in their colours, the current one marked (D-115)', () => {
    setup();
    const segs = () => [...screen.getByTestId('round-bar').children];
    expect(screen.getByTestId('round-bar')).toHaveAttribute('aria-hidden', 'true');
    expect(segs()).toHaveLength(3);
    expect(segs()[0]).toHaveClass('is-current');
    fireEvent.click(btn('I know Show in future'));
    expect(segs()[0]).toHaveClass('is-knowAgain');
    expect(segs()[1]).toHaveClass('is-current');
    fireEvent.click(btn('I don’t know Show in next round'));
    expect(segs()[1]).toHaveClass('is-dontKnow');
    // Changing an answer with Back changes its colour.
    fireEvent.click(btn('Back'));
    fireEvent.click(btn('I don’t know Show in next round'));
    expect(segs()[0]).toHaveClass('is-dontKnow');
  });

  it('Don’t know flips to the back, keeps the layout, turns red off and Next pumps', () => {
    setup();
    fireEvent.click(btn('I don’t know Show in next round'));
    expect(side()).toBe('back');
    // The answers stay in place; red is off, the Know stays on to change one's mind (D-109).
    expect(btn('I don’t know Show in next round')).toBeDisabled();
    expect(btn('I know Show in future')).toBeEnabled();
    // The guest's green one stays locked: off, but it can still explain itself (D-043).
    expect(btn('I know Never show again (sign-in to enable)')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getAllByRole('button', { name: 'Next' })).toHaveLength(1);
    expect(btn('Next')).toHaveClass('is-urgent');
    expect(btn('Next')).toBeEnabled();
    expect(document.activeElement).toBe(btn('Next'));
    // The "Clicked" chip shows at once, on both faces (D-104).
    expect(screen.getByTestId('answer-chip')).toHaveTextContent('Clicked: I don’t know');
    expect(screen.getAllByText('Clicked: I don’t know')).toHaveLength(2);
    // Tinted; no pop or tilt right after the answer, only on a card reached with Back (D-108).
    expect(screen.getByTestId('answer-chip')).toHaveClass('answer-chip');
    expect(screen.getByTestId('answer-chip')).not.toHaveClass('answer-chip--arrived');
    // The hints cover is on the front only (the back shows the hints uncovered).
    expect(screen.queryByRole('button', { name: 'Tap to see hints' })).toBeNull();
    fireEvent.click(btn('Flip'));
    expect(btn('Tap to see hints')).toBeEnabled();
    // A red loop around the card (D-106); it goes with the card.
    expect(document.querySelector('.flip-card .dk-trace')).not.toBeNull();
    fireEvent.click(btn('Next'));
    expect(document.querySelector('.dk-trace')).toBeNull();
  });

  it('a tap on the cover reveals the hints, a tap on them covers them again; H too; the card stays put (D-047, D-078)', () => {
    setup();
    const front = () => screen.queryByTestId('front-hints');
    const hints = () => document.querySelector('.flip-card__front .hints-cover') as HTMLElement;
    const scroller = () => hints().querySelector('.hints-area__scroll') as HTMLElement;
    const tap = (x = 50, y = 50, dx = 0) => {
      fireEvent.pointerDown(scroller(), { clientX: x, clientY: y });
      fireEvent.click(scroller(), { clientX: x + dx, clientY: y });
    };
    expect(front()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hints' })).toBeNull(); // no Hints button
    fireEvent.click(btn('Tap to see hints'));
    expect(front()).not.toBeNull();
    expect(side()).toBe('front'); // revealing the hints doesn't flip the card
    expect(screen.queryByRole('button', { name: 'Tap to see hints' })).toBeNull();
    // A drag (the finger moved) or a tap right after scrolling keeps them open…
    tap(50, 50, 40);
    expect(front()).not.toBeNull();
    fireEvent.scroll(scroller());
    tap();
    expect(front()).not.toBeNull();
    // …a clean tap covers them again.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000);
    tap();
    expect(btn('Tap to see hints')).toHaveAttribute('aria-expanded', 'false');
    expect(front()).toBeNull();
    // H toggles too, and "Hide hints" stays for the keyboard and screen readers.
    fireEvent.keyDown(window, { key: 'h' });
    expect(front()).not.toBeNull();
    fireEvent.click(btn('Hide hints'));
    expect(front()).toBeNull();
    // A tap on the card itself does nothing; only the Flip button turns it.
    fireEvent.click(screen.getByTestId('flip-card'));
    expect(side()).toBe('front');
  });

  it('Back brings a card back with its hints cover as it was left (D-048)', () => {
    setup();
    const front = () => screen.queryByTestId('front-hints');
    fireEvent.click(btn('Tap to see hints'));
    expect(front()).not.toBeNull();
    fireEvent.click(btn('I know Show in future'));
    expect(front()).toBeNull(); // the next card arrives covered
    fireEvent.click(btn('Back'));
    expect(progress()).toBe('Round 1 · Card 1/3 · 1 known');
    expect(front()).not.toBeNull(); // still open, as it was left
    expect(btn('Hide hints')).toBeInTheDocument();
  });

  it('Back shows the previous card front side up with its answer; Next steps forward again', () => {
    setup();
    expect(btn('Back')).toBeDisabled(); // first card of the round
    fireEvent.click(btn('I know Show in future'));
    fireEvent.click(btn('I don’t know Show in next round'));
    expect(side()).toBe('back');
    fireEvent.click(btn('Back'));
    expect(progress()).toBe('Round 1 · Card 1/3 · 1 known');
    expect(side()).toBe('front');
    // Reached with Back: the chip pops in, then tilts every 3s (D-108).
    expect(screen.getByTestId('answer-chip')).toHaveClass('answer-chip--arrived');
    // A guest's Know is the orange one (D-042).
    // Short on screen; the orange one's caption is there for screen readers (D-049).
    expect(screen.getByTestId('answer-chip')).toHaveTextContent('Clicked: I know (show in future)');
    expect(screen.getByText('Card 1 of 3. Clicked: I know (show in future)')).toHaveClass(
      'sr-only',
    );
    expect(btn('Next')).toBeEnabled(); // answered, so Next skips ahead without answering again
    fireEvent.click(btn('Next'));
    expect(progress()).toBe('Round 1 · Card 2/3 · 1 known');
    expect(side()).toBe('front'); // even though it was showing its back when we left it
    expect(screen.getByTestId('answer-chip')).toHaveTextContent('Clicked: I don’t know');
    fireEvent.click(btn('Next'));
    expect(screen.queryByTestId('answer-chip')).not.toBeInTheDocument(); // not answered yet
    expect(btn('Next')).toBeDisabled();
  });

  it('changing an answer: Know → Don’t know unmarks it, Don’t know → Know marks it', () => {
    const sink = { onKnow: vi.fn(), onUnknow: vi.fn() };
    setup(sink, { isGuest: false });
    fireEvent.click(btn('I know Never show again'));
    expect(sink.onKnow).toHaveBeenCalledTimes(1);
    expect(sink.onKnow).toHaveBeenCalledWith(expect.objectContaining({ round: 1 }), 'he');
    fireEvent.click(btn('Back'));
    fireEvent.click(btn('I don’t know Show in next round'));
    expect(sink.onUnknow).toHaveBeenCalledTimes(1);
    expect(progress()).toBe('Round 1 · Card 1/3 · 0 known');
    expect(side()).toBe('back');
    fireEvent.click(btn('Next'));
    fireEvent.click(btn('Back'));
    fireEvent.click(btn('I know Never show again'));
    expect(sink.onKnow).toHaveBeenCalledTimes(2);
    expect(progress()).toBe('Round 1 · Card 2/3 · 1 known');
    // Know again on a card already known changes nothing in the queue.
    fireEvent.click(btn('Back'));
    fireEvent.click(btn('I know Never show again'));
    expect(sink.onKnow).toHaveBeenCalledTimes(2);
  });

  it('guests see all three answers, the green one locked; K does nothing, A works (D-042)', () => {
    setup();
    const know = btn('I know Never show again (sign-in to enable)');
    expect(know).toHaveAttribute('aria-disabled', 'true');
    expect(know).toHaveClass('lbtn--know', 'is-locked');
    expect(know).toHaveAttribute('title', 'Sign-in to enable');
    expect(know.querySelector('.lbtn__lock')).not.toBeNull();
    expect(btn('I know Show in future')).toBeEnabled();
    expect(btn('I know Show in future')).not.toHaveClass('is-locked');
    // The same captions as for signed-in learners.
    expect(screen.getByText('Never show again')).toBeInTheDocument();
    expect(screen.getByText('Show in future')).toBeInTheDocument();
    expect(screen.getByText('Show in next round')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'k' });
    expect(progress()).toBe('Round 1 · Card 1/3 · 0 known');
    fireEvent.keyDown(window, { key: 'a' });
    expect(progress()).toBe('Round 1 · Card 2/3 · 1 known');
  });

  it('tapping the locked green button (or K) shows "Sign-in required" over it for 1.5 seconds (D-043)', () => {
    vi.useFakeTimers();
    setup();
    const tip = () => document.querySelector('.locked-tip');
    expect(tip()).toBeNull();
    fireEvent.click(btn('I know Never show again (sign-in to enable)'));
    expect(tip()).toHaveTextContent('Sign-in required');
    expect(
      within(tip() as HTMLElement).getByRole('button', { name: 'Sign-in' }),
    ).toBeInTheDocument();
    expect(progress()).toBe('Round 1 · Card 1/3 · 0 known'); // nothing is marked
    act(() => vi.advanceTimersByTime(1400));
    expect(tip()).not.toBeNull();
    act(() => vi.advanceTimersByTime(100));
    expect(tip()).toBeNull();
    fireEvent.keyDown(window, { key: 'k' });
    expect(tip()).toHaveTextContent('Sign-in required');
    expect(progress()).toBe('Round 1 · Card 1/3 · 0 known');
  });

  describe('the nudge (D-066)', () => {
    /** Motion allowed (no "reduce motion"), unless `reduce`. */
    const motion = (reduce = false) =>
      vi.stubGlobal('matchMedia', (q: string) => ({
        matches: q.includes('no-preference') ? !reduce : reduce,
        media: q,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }));
    const nudging = (name: string) => btn(name).classList.contains('is-nudging');
    const answers = ['I know Show in future', 'I don’t know Show in next round'];
    afterEach(() => vi.unstubAllGlobals());

    it('on the first cards, the available answers pump shortly after each change; Back and Stop never', () => {
      motion();
      vi.useFakeTimers();
      setup();
      for (const name of answers) expect(nudging(name)).toBe(false);
      act(() => vi.advanceTimersByTime(300));
      for (const name of answers) expect(nudging(name)).toBe(true);
      for (const name of ['Back', 'Next']) expect(nudging(name)).toBe(false);
      act(() => vi.advanceTimersByTime(1700));
      for (const name of answers) expect(nudging(name)).toBe(false);
      // A flip is a change too.
      fireEvent.click(btn('Flip'));
      act(() => vi.advanceTimersByTime(300));
      expect(nudging(answers[0]!)).toBe(true);
    });

    it('after the first three cards of a round, only a pause of 4 seconds nudges', () => {
      motion();
      vi.useFakeTimers();
      setup(undefined, { count: 5 });
      for (let i = 0; i < 3; i++) {
        fireEvent.click(btn('I don’t know Show in next round'));
        fireEvent.click(btn('Next'));
      }
      expect(progress()).toBe('Round 1 · Card 4/5 · 0 known');
      act(() => vi.advanceTimersByTime(300));
      expect(nudging(answers[0]!)).toBe(false);
      act(() => vi.advanceTimersByTime(3700));
      expect(nudging(answers[0]!)).toBe(true);
    });

    it('while the user still waits, a soft shine repeats every 10 seconds (D-074)', () => {
      motion();
      vi.useFakeTimers();
      setup(undefined, { count: 5 });
      for (let i = 0; i < 3; i++) {
        fireEvent.click(btn('I don’t know Show in next round'));
        fireEvent.click(btn('Next'));
      }
      const shining = () => btn(answers[0]!).classList.contains('is-shining');
      act(() => vi.advanceTimersByTime(4000)); // the idle nudge: pump and shine
      expect(nudging(answers[0]!)).toBe(true);
      act(() => vi.advanceTimersByTime(1700));
      expect(nudging(answers[0]!)).toBe(false);
      act(() => vi.advanceTimersByTime(4300)); // 10 s: the shine alone
      expect(shining()).toBe(true);
      expect(nudging(answers[0]!)).toBe(false);
      act(() => vi.advanceTimersByTime(1700));
      expect(shining()).toBe(false);
      act(() => vi.advanceTimersByTime(8300)); // 20 s: again
      expect(shining()).toBe(true);
    });

    it('Flip shines with them only while the card was not flipped yet (D-074)', () => {
      motion();
      vi.useFakeTimers();
      setup(undefined, { count: 5 });
      fireEvent.click(btn('Flip')); // Flip used once: it stops pulsing for the practice
      fireEvent.click(btn('Flip')); // back to the front of the same card
      act(() => vi.advanceTimersByTime(4000));
      expect(btn('Flip').className).not.toMatch(/is-nudging|is-shining/);
      expect(nudging(answers[0]!)).toBe(true);
      // The next card: Flip untouched there, so it joins in.
      fireEvent.click(btn('I don’t know Show in next round'));
      fireEvent.click(btn('Next'));
      act(() => vi.advanceTimersByTime(300));
      expect(btn('Flip')).toHaveClass('is-nudging');
    });

    it('while Flip still pulses (never used), it shines with the others too (D-074)', () => {
      motion();
      vi.useFakeTimers();
      setup();
      act(() => vi.advanceTimersByTime(300));
      expect(btn('Flip')).toHaveClass('is-breathing', 'is-shining');
      expect(btn('Flip')).not.toHaveClass('is-nudging'); // no pump on top of the pulse
    });

    it('on a card reached with Back, Next keeps pumping and shines after the answers (D-084)', () => {
      motion();
      vi.useFakeTimers();
      setup(undefined, { count: 5 });
      expect(btn('Next')).not.toHaveClass('is-pumping'); // unanswered: Next is off
      fireEvent.click(btn('I don’t know Show in next round'));
      expect(btn('Next')).toHaveClass('is-urgent');
      expect(btn('Next')).not.toHaveClass('is-pumping'); // after Don't know: its own pump
      fireEvent.click(btn('Next'));
      fireEvent.click(btn('Back'));
      expect(btn('Next')).toHaveClass('is-pumping');
      expect(btn('Next')).not.toHaveClass('is-urgent');
      act(() => vi.advanceTimersByTime(300));
      expect(btn('Next')).toHaveClass('is-nudging', 'nudge-4');
      for (const name of answers) expect(nudging(name)).toBe(true); // the answers keep theirs
      // Next again, to the unanswered card: Next is off and still.
      fireEvent.click(btn('Next'));
      expect(btn('Next')).not.toHaveClass('is-pumping');
    });

    it('Flip pulses until it is first used, and stays still after a refresh', () => {
      motion();
      setup();
      const flip = () => btn('Flip');
      expect(flip()).toHaveClass('is-breathing');
      fireEvent.click(flip());
      expect(flip()).not.toHaveClass('is-breathing');
      expect(loadPractice()?.flipped).toBe(true);
    });

    it('between cards: Next slides the old card out left and the new one in from the right; Back the reverse (D-110)', () => {
      motion();
      setup();
      const wrapper = () => screen.getByTestId('flip-card').closest('.card-enter');
      const ghost = () => document.querySelector('.slide-ghost');
      fireEvent.click(btn('I don’t know Show in next round'));
      fireEvent.click(btn('Next'));
      expect(ghost()).toHaveClass('slide-ghost--left');
      expect(ghost()).toHaveAttribute('aria-hidden', 'true');
      expect(wrapper()).toHaveClass('card-enter--right');
      fireEvent.click(btn('Back'));
      expect(ghost()).toHaveClass('slide-ghost--right');
      expect(wrapper()).toHaveClass('card-enter--left');
      // A Know: its own animation takes the old card; the new one comes in from the right.
      fireEvent.click(btn('Next'));
      fireEvent.click(btn('I know Show in future'));
      expect(wrapper()).toHaveClass('card-enter--know');
    });

    it('between cards: no sliding copy with "reduce motion" (D-110)', () => {
      motion(true);
      setup();
      fireEvent.click(btn('I don’t know Show in next round'));
      fireEvent.click(btn('Next'));
      expect(document.querySelector('.slide-ghost')).toBeNull();
    });

    it('the hints cover peeks and its finger taps every 5s until opened and closed once (D-121)', () => {
      motion();
      vi.useFakeTimers();
      setup();
      const finger = () => document.querySelector('.flip-card__front .hints-cover__finger');
      const peekCopy = () => document.querySelector('.flip-card__front .hints-cover__peek');
      expect(peekCopy()).toHaveAttribute('aria-hidden', 'true');
      expect(screen.queryByTestId('front-hints')).toBeNull(); // the copy carries no test ids
      expect(finger()).not.toHaveClass('is-tapping');
      act(() => vi.advanceTimersByTime(7000));
      expect(finger()).toHaveClass('is-tapping');
      // Opened and covered again: no more hints for the rest of the practice.
      fireEvent.click(btn('Tap to see hints'));
      fireEvent.keyDown(window, { key: 'h' });
      expect(peekCopy()).toBeNull();
      fireEvent.click(btn('I know Show in future'));
      act(() => vi.advanceTimersByTime(8000));
      expect(peekCopy()).toBeNull();
      expect(finger()).not.toHaveClass('is-tapping');
    });

    it('nothing moves with "reduce motion"', () => {
      motion(true);
      vi.useFakeTimers();
      setup();
      act(() => vi.advanceTimersByTime(5000));
      for (const name of answers) expect(nudging(name)).toBe(false);
      expect(btn('Flip')).not.toHaveClass('is-breathing');
    });
  });

  it('signed-in: Know (forever), Know (ask again), Don’t know; ask again is never recorded', () => {
    const sink = { onKnow: vi.fn(), onUnknow: vi.fn() };
    setup(sink, { isGuest: false });
    const names = screen
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent)
      .filter((n) => /know/i.test(n ?? ''));
    expect(names).toEqual([
      'I know Never show again',
      'I know Show in future',
      'I don’t know Show in next round',
    ]);
    expect(btn('I know Show in future')).toHaveClass('lbtn--again');
    expect(btn('I know Show in future')).not.toHaveClass('is-locked');
    expect(screen.getByText('Never show again')).toBeInTheDocument();
    expect(screen.getByText('Show in future')).toBeInTheDocument();
    expect(screen.getByText('Show in next round')).toBeInTheDocument();

    fireEvent.click(btn('I know Show in future'));
    expect(progress()).toBe('Round 1 · Card 2/3 · 1 known'); // counts like Know in the practice
    expect(sink.onKnow).not.toHaveBeenCalled();
    expect(loadPractice()?.state.known[0]?.again).toBe(true); // a refresh keeps it
    fireEvent.click(btn('Back'));
    // Short on screen; the orange one's caption is there for screen readers (D-049).
    expect(screen.getByTestId('answer-chip')).toHaveTextContent('Clicked: I know (show in future)');
    expect(screen.getByText('Card 1 of 3. Clicked: I know (show in future)')).toHaveClass(
      'sr-only',
    );

    fireEvent.keyDown(window, { key: 'a' }); // the same answer: nothing changes
    expect(sink.onKnow).not.toHaveBeenCalled();
    expect(sink.onUnknow).not.toHaveBeenCalled();
  });

  it('signed-in: switching between the two Knows records and unrecords the word', () => {
    const sink = { onKnow: vi.fn(), onUnknow: vi.fn() };
    setup(sink, { isGuest: false });
    fireEvent.click(btn('I know Never show again'));
    expect(sink.onKnow).toHaveBeenCalledTimes(1);
    fireEvent.click(btn('Back'));
    fireEvent.click(btn('I know Show in future'));
    expect(sink.onUnknow).toHaveBeenCalledWith(sink.onKnow.mock.calls[0]![0].id, 'he');
    expect(progress()).toBe('Round 1 · Card 2/3 · 1 known');
    fireEvent.click(btn('Back'));
    fireEvent.click(btn('I know Never show again'));
    expect(sink.onKnow).toHaveBeenCalledTimes(2);
    fireEvent.click(btn('Back'));
    fireEvent.click(btn('I know Show in future'));
    fireEvent.click(btn('Back'));
    fireEvent.click(btn('I don’t know Show in next round')); // from ask again: nothing was recorded, nothing to undo
    expect(sink.onUnknow).toHaveBeenCalledTimes(2);
    expect(sink.onKnow).toHaveBeenCalledTimes(2);
  });

  it('← and → are Back and Next', () => {
    setup();
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(progress()).toBe('Round 1 · Card 1/3 · 1 known');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(progress()).toBe('Round 1 · Card 2/3 · 1 known');
  });

  it('Practice completed plays the applause; the sound switch turns it off and is remembered', () => {
    window.localStorage.clear();
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementation(() => Promise.resolve());
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    setup();
    for (let i = 0; i < 3; i++) fireEvent.click(btn('I know Show in future'));
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
    for (let i = 0; i < 3; i++) fireEvent.click(btn('I know Show in future'));
    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('crown')).toBeInTheDocument(); // reduced motion here: no flight
    fireEvent.click(screen.getByRole('button', { name: /Back to the last card/ }));
    expect(loadPractice()?.celebrated).toBe(true); // survives a refresh too
    fireEvent.click(btn('Next'));
    expect(screen.getByRole('heading', { name: 'Practice completed' })).toBeInTheDocument();
    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('crown')).toBeInTheDocument();
    expect(screen.queryByTestId('confetti')).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('celebrates again when a new round was started after the celebration', () => {
    window.localStorage.clear();
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    setup();
    for (let i = 0; i < 3; i++) fireEvent.click(btn('I know Show in future'));
    expect(play).toHaveBeenCalledTimes(1);
    // Back, change the last card to Don't know, then Back to Know again: no new round, no repeat.
    fireEvent.click(screen.getByRole('button', { name: /Back to the last card/ }));
    fireEvent.click(btn('I don’t know Show in next round'));
    fireEvent.click(btn('Back')); // to card 2
    fireEvent.click(btn('Next')); // card 3 again, answered Don't know
    fireEvent.click(btn('I know Show in future')); // changed back: the practice is completed again
    expect(screen.getByRole('heading', { name: 'Practice completed' })).toBeInTheDocument();
    expect(play).toHaveBeenCalledTimes(1);
    // Now a real new round: Back, Don't know, Next → round break → Continue → Know → completed.
    fireEvent.click(screen.getByRole('button', { name: /Back to the last card/ }));
    fireEvent.click(btn('I don’t know Show in next round'));
    fireEvent.click(btn('Next'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(btn('I know Show in future'));
    expect(screen.getByRole('heading', { name: 'Practice completed' })).toBeInTheDocument();
    expect(play).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });

  it('the round break and the summary go back to the last card', () => {
    setup();
    fireEvent.click(btn('I know Show in future'));
    fireEvent.click(btn('I know Show in future'));
    fireEvent.click(btn('I know Show in future'));
    expect(screen.getByRole('heading', { name: 'Practice completed' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Back to the last card/ }));
    expect(progress()).toBe('Round 1 · Card 3/3 · 3 known');
    expect(loadPractice()).not.toBeNull(); // the practice is alive again
    fireEvent.click(btn('I don’t know Show in next round'));
    fireEvent.click(btn('Next'));
    expect(screen.getByRole('heading', { name: 'Round 2 · 1 card left' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Back to the last card/ }));
    expect(progress()).toBe('Round 1 · Card 3/3 · 2 known');
  });

  describe('Next counts down after “I don’t know” (D-069)', () => {
    const nextLabel = () => btn('Next').querySelector('.lbtn__label')?.textContent;
    const tick = (seconds: number) => {
      for (let i = 0; i < seconds; i++) act(() => vi.advanceTimersByTime(1000));
    };

    it('shows the seconds under Next and moves to the next card at 0', () => {
      vi.useFakeTimers();
      setup();
      expect(nextLabel()).toBe('Next');
      fireEvent.click(btn('I don’t know Show in next round'));
      expect(nextLabel()).toBe('Next · 10');
      expect(btn('Next')).toHaveAccessibleName('Next'); // the digits aren't read out
      tick(4);
      expect(nextLabel()).toBe('Next · 6');
      tick(6);
      expect(progress()).toBe('Round 1 · Card 2/3 · 0 known');
      expect(side()).toBe('front');
      expect(nextLabel()).toBe('Next'); // no countdown on the new card
    });

    it('any key, tap or scroll stops it for good', () => {
      vi.useFakeTimers();
      setup();
      fireEvent.click(btn('I don’t know Show in next round'));
      fireEvent.wheel(window);
      expect(nextLabel()).toBe('Next');
      tick(15);
      expect(progress()).toBe('Round 1 · Card 1/3 · 0 known');
    });

    it('uses the length from the settings; 0 means no countdown', () => {
      vi.useFakeTimers();
      setup(undefined, { nextSeconds: 0 });
      fireEvent.click(btn('I don’t know Show in next round'));
      expect(nextLabel()).toBe('Next');
      tick(15);
      expect(progress()).toBe('Round 1 · Card 1/3 · 0 known');
    });

    it('not on a card reached with Back', () => {
      vi.useFakeTimers();
      setup();
      fireEvent.click(btn('I know Show in future'));
      fireEvent.click(btn('Back'));
      expect(nextLabel()).toBe('Next');
      tick(15);
      expect(progress()).toBe('Round 1 · Card 1/3 · 1 known');
    });
  });

  describe('the break between rounds (D-067)', () => {
    const toBreak = (continueSeconds?: number) => {
      const router = setup(undefined, continueSeconds === undefined ? {} : { continueSeconds });
      fireEvent.click(btn('I know Show in future'));
      fireEvent.click(btn('I know Show in future'));
      fireEvent.click(btn('I don’t know Show in next round'));
      fireEvent.click(btn('Next'));
      expect(screen.getByRole('heading', { name: 'Round 2 · 1 card left' })).toBeInTheDocument();
      return router;
    };
    const continueButton = () => screen.getByTestId('continue');
    const tick = (seconds: number) => {
      for (let i = 0; i < seconds; i++) act(() => vi.advanceTimersByTime(1000));
    };

    it('shows what was known, "to next round", and moves on by itself after 10 seconds', () => {
      vi.useFakeTimers();
      toBreak();
      expect(screen.getByText('You knew 2 of 3 — 1 to go.')).toBeInTheDocument();
      expect(screen.getByText('to next round')).toBeInTheDocument();
      expect(continueButton()).toHaveTextContent('Continue · 10');
      expect(continueButton()).toHaveAccessibleName('Continue'); // the digits aren't read out
      tick(3);
      expect(continueButton()).toHaveTextContent('Continue · 7');
      tick(7);
      expect(progress()).toBe('Round 2 · Card 1/1 · 2 known');
    });

    it('uses the length from the settings; 0 means no countdown (D-068)', () => {
      vi.useFakeTimers();
      toBreak(0);
      expect(continueButton()).toHaveTextContent(/^Continue$/);
      tick(15);
      expect(screen.getByRole('heading', { name: 'Round 2 · 1 card left' })).toBeInTheDocument();
    });

    it('any key or tap stops the countdown for good', () => {
      vi.useFakeTimers();
      toBreak();
      fireEvent.keyDown(window, { key: 'x' });
      expect(continueButton()).toHaveTextContent(/^Continue$/);
      tick(10);
      expect(screen.getByRole('heading', { name: 'Round 2 · 1 card left' })).toBeInTheDocument();
    });

    it('a tap stops it too', () => {
      vi.useFakeTimers();
      toBreak();
      fireEvent.pointerDown(document.body);
      tick(10);
      expect(screen.getByRole('heading', { name: 'Round 2 · 1 card left' })).toBeInTheDocument();
    });

    it('Home asks first, then ends the practice; Esc asks too', async () => {
      const router = toBreak();
      fireEvent.keyDown(window, { key: 'Escape' });
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('This will stop the practice. Are you sure?');
      fireEvent.click(within(dialog).getByRole('button', { name: 'No' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Home' }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Yes' }));
      await waitFor(() => expect(router.state.location.pathname).toBe('/'));
      expect(loadPractice()).toBeNull();
    });
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
    expect(progress()).toBe('Round 1 · Card 2/3 · 0 known');
    fireEvent.keyDown(window, { key: 'a' }); // a guest's Know (D-042)
    expect(progress()).toBe('Round 1 · Card 3/3 · 1 known');
  });

  it('reaches a round break, continues, and ends with a summary', () => {
    setup();
    fireEvent.click(btn('I know Show in future'));
    fireEvent.click(btn('I know Show in future'));
    fireEvent.click(btn('I don’t know Show in next round'));
    fireEvent.click(btn('Next'));
    expect(screen.getByRole('heading', { name: 'Round 2 · 1 card left' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(progress()).toBe('Round 2 · Card 1/1 · 2 known');
    fireEvent.click(btn('I know Show in future'));
    const summary = screen
      .getByRole('heading', { name: 'Practice completed' })
      .closest('section') as HTMLElement;
    expect(within(summary).getByText('Already knew').nextSibling).toHaveTextContent('2');
    expect(within(summary).getByText('Learned here').nextSibling).toHaveTextContent('1');
    // The finished practice stays saved while the summary shows (a language switch re-mounts the
    // screen, D-123); Home clears it.
    expect(loadPractice()?.state.phase).toBe('finished');
    fireEvent.click(within(summary).getByRole('button', { name: 'Home' }));
    expect(loadPractice()).toBeNull();
  });

  describe('New practice on the summary (FR-L32)', () => {
    const finish = () => {
      // Signed-in learners have two Knows; the green one is recorded.
      for (let i = 0; i < 3; i++) fireEvent.click(btn('I know Never show again'));
      expect(screen.getByRole('heading', { name: 'Practice completed' })).toBeInTheDocument();
    };

    it('starts the next practice right away with the same choices', async () => {
      const posted: unknown[] = [];
      const router = setup(undefined, {
        isGuest: false,
        routes: {
          'POST /api/practices': (init) => {
            posted.push(JSON.parse(String(init?.body)));
            return Response.json({ requested: 5, returned: 2, cards: [makeCard(7), makeCard(8)] });
          },
        },
      });
      finish();
      const newPractice = screen.getByRole('button', { name: 'New practice' });
      await waitFor(() => expect(newPractice).toBeEnabled()); // once the settings have loaded
      fireEvent.click(newPractice);
      await waitFor(() => expect(progress()).toBe('Round 1 · Card 1/2 · 0 known'));
      expect(posted).toEqual([{ source: 'en', target: 'he', topicId: null, size: 5 }]);
      expect(router.state.location.pathname).toBe('/practice');
      expect(loadPractice()?.cards.map((c) => c.itemId)).toEqual([7, 8]);
      expect(loadPractice()?.selection).toMatchObject({ sourceLang: 'en', targetLang: 'he' });
      expect(
        await screen.findByText('Only 2 new cards in All topics, starting with 2'),
      ).toBeVisible();
    });

    it('says so when no new cards are left, and Home still works', async () => {
      const router = setup(undefined, {
        isGuest: false,
        routes: {
          'POST /api/practices': () => Response.json({ requested: 5, returned: 0, cards: [] }),
        },
      });
      finish();
      const newPractice = screen.getByRole('button', { name: 'New practice' });
      await waitFor(() => expect(newPractice).toBeEnabled()); // once the settings have loaded
      fireEvent.click(newPractice);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'No new cards left for these choices. Go Home to pick others.',
      );
      // Two Homes on the summary: at the top (as in the practice header, D-124) and in the middle.
      const homes = screen.getAllByRole('button', { name: 'Home' });
      expect(homes).toHaveLength(2);
      fireEvent.click(homes[0]!);
      await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    });

    it('shows why it could not start (e.g. the daily limit)', async () => {
      setup(undefined, {
        isGuest: false,
        routes: {
          'POST /api/practices': () =>
            Response.json(
              { error: { code: 'RATE_LIMITED', message: 'limit', details: { remaining: 3 } } },
              { status: 429 },
            ),
        },
      });
      finish();
      const newPractice = screen.getByRole('button', { name: 'New practice' });
      await waitFor(() => expect(newPractice).toBeEnabled()); // once the settings have loaded
      fireEvent.click(newPractice);
      expect(await screen.findByRole('alert')).toHaveTextContent(/You can still get 3 cards today/);
      expect(screen.getByRole('heading', { name: 'Practice completed' })).toBeInTheDocument();
    });
  });

  it('saves progress so a refresh resumes; there is no Stop; Home and Esc ask, then clear it (D-072)', async () => {
    const router = setup();
    fireEvent.click(btn('I know Show in future'));
    expect(loadPractice()?.state.index).toBe(1);
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    // Home asks first; No keeps the practice.
    const dialog = screen.getByRole('dialog', { name: 'Back to Home?' });
    expect(dialog).toHaveTextContent('This will stop the practice. Are you sure?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'No' }));
    expect(loadPractice()).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' }); // Esc asks the same question
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Yes' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(loadPractice()).toBeNull();
  });

  it('the Keyboard shortcuts popover lists the keys, and Esc closes it without stopping', () => {
    setup();
    const toggle = screen.getByRole('button', { name: 'Keyboard shortcuts' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Next / Continue')).toBeInTheDocument();
    fireEvent.keyDown(toggle, { key: 'Escape' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(loadPractice()).not.toBeNull(); // still in the practice
  });

  it('Home asks first: No keeps the practice (shortcuts paused meanwhile), Yes stops it', async () => {
    const router = setup();
    fireEvent.click(screen.getByRole('button', { name: /Home/ }));
    const dialog = screen.getByRole('dialog', { name: 'Back to Home?' });
    expect(dialog).toHaveTextContent('This will stop the practice. Are you sure?');
    fireEvent.keyDown(window, { key: 'k' }); // ignored while the question is open
    expect(progress()).toBe('Round 1 · Card 1/3 · 0 known');
    fireEvent.click(within(dialog).getByRole('button', { name: 'No' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/practice');
    expect(loadPractice()).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Home/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Yes' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(loadPractice()).toBeNull();
  });

  it('redirects home when there is no practice to resume', async () => {
    const router = createMemoryRouter(
      [
        { path: '/practice', element: <PracticePage /> },
        { path: '/', element: <p>home page</p> },
      ],
      { initialEntries: ['/practice'] },
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
