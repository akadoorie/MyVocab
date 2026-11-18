import { createLoop } from '@myvocab/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/Toast';
import { makeCard } from '../../test/fixtures';
import { loadLoop, saveLoop } from './loop-storage';
import { LoopPage, type KnownSink } from './LoopPage';

const CARDS = [makeCard(1), makeCard(2), makeCard(3)];

function setup(sink?: KnownSink) {
  saveLoop({
    cards: CARDS,
    state: createLoop([1, 2, 3], 42),
    undoWindowSeconds: 4,
    selection: { sourceLang: 'en', targetLang: 'he', categoryId: null, type: 'word', size: 5 },
    isGuest: true,
  });
  const router = createMemoryRouter(
    [
      { path: '/loop', element: <LoopPage {...(sink ? { knownSink: sink } : {})} /> },
      { path: '/', element: <p>home page</p> },
    ],
    { initialEntries: ['/loop'] },
  );
  render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>,
  );
  return router;
}

const btn = (name: string) => {
  const all = screen.getAllByRole('button', { name });
  return all[all.length - 1] as HTMLElement;
};
const progress = () => screen.getByTestId('progress').textContent;
const side = () => screen.getByTestId('flip-card').getAttribute('data-side');

beforeEach(() => window.sessionStorage.clear());
afterEach(() => vi.useRealTimers());

describe('LoopPage', () => {
  it('starts on the front with Next disabled and the decision buttons enabled', () => {
    setup();
    expect(progress()).toBe('Cycle 1 · Card 1/3 · 0 known');
    expect(side()).toBe('front');
    expect(btn('Next')).toBeDisabled();
    for (const name of ['Know', 'Don’t know', 'Hints', 'Flip']) expect(btn(name)).toBeEnabled();
  });

  it('Don’t know flips to the back, swaps Know/Don’t know for a big Next and focuses it', () => {
    setup();
    fireEvent.click(btn('Don’t know'));
    expect(side()).toBe('back');
    // Know / Don't know give way to one wide Next pill.
    expect(screen.queryByRole('button', { name: 'Know' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Don’t know' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Next' })).toHaveLength(1);
    expect(btn('Next')).toHaveClass('lbtn--next');
    expect(btn('Next')).toBeEnabled();
    expect(document.activeElement).toBe(btn('Next'));
    expect(btn('Hints')).toBeDisabled(); // only on an unrevealed front
    fireEvent.click(btn('Flip'));
    expect(btn('Hints')).toBeEnabled();
  });

  it('Know shows the Undo bar with a countdown; it disappears after the undo window', () => {
    vi.useFakeTimers();
    const sink = { onKnow: vi.fn(), onUndo: vi.fn() };
    setup(sink);
    fireEvent.click(btn('Know'));
    expect(progress()).toBe('Cycle 1 · Card 2/3 · 1 known');
    expect(screen.getByTestId('undo-label')).toHaveTextContent(/→ מילה-/);
    expect(sink.onKnow).toHaveBeenCalledWith(expect.objectContaining({ cycle: 1 }), 'he');
    // The countdown on the Undo button shows the seconds left (the window is 4s in this setup).
    expect(screen.getByTestId('undo-timer')).toHaveTextContent('4');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByTestId('undo-timer')).toHaveTextContent('3');
    act(() => vi.advanceTimersByTime(3100));
    expect(screen.queryByTestId('undo-label')).not.toBeInTheDocument();
  });

  it('Undo reverses the last Know', () => {
    const sink = { onKnow: vi.fn(), onUndo: vi.fn() };
    setup(sink);
    fireEvent.click(btn('Know'));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(progress()).toBe('Cycle 1 · Card 2/3 · 0 known');
    expect(sink.onUndo).toHaveBeenCalledTimes(1);
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
    fireEvent.click(btn('Know'));
    fireEvent.click(btn('Know'));
    fireEvent.click(btn('Don’t know'));
    fireEvent.click(btn('Next'));
    expect(screen.getByRole('heading', { name: 'Cycle 2 · 1 card left' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(progress()).toBe('Cycle 2 · Card 1/1 · 2 known');
    fireEvent.click(btn('Know'));
    const summary = screen
      .getByRole('heading', { name: 'Session complete' })
      .closest('section') as HTMLElement;
    expect(within(summary).getByText('Already knew').nextSibling).toHaveTextContent('2');
    expect(within(summary).getByText('Learned here').nextSibling).toHaveTextContent('1');
    expect(loadLoop()).toBeNull(); // finishing clears the saved loop
  });

  it('saves progress so a refresh resumes, and Stop clears it and goes home', async () => {
    const router = setup();
    fireEvent.click(btn('Know'));
    expect(loadLoop()?.state.index).toBe(1);
    fireEvent.click(screen.getAllByRole('button', { name: /Stop/ })[0] as HTMLElement);
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
    render(
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>,
    );
    expect(await screen.findByText('home page')).toBeInTheDocument();
  });
});
