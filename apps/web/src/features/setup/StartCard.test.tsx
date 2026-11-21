import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/Toast';
import { makeCard, META } from '../../test/fixtures';
import { loadLoop } from '../loop/loop-storage';
import { StartCard } from './StartCard';

const guest = { user: null, isGuest: true, loading: false };
const learner = {
  user: {
    id: 'u',
    name: 'U',
    email: 'u@example.test',
    image: null,
    role: 'user' as const,
    isOwner: false,
  },
  isGuest: false,
  loading: false,
};
const admin = { ...learner, user: { ...learner.user, role: 'admin' as 'user' } };

function mockApi(cards = [makeCard(1), makeCard(2)]) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.startsWith('/api/loops/available')) return Response.json({ available: 6 });
    if (url === '/api/loops' && init?.method === 'POST') {
      return Response.json({ requested: 5, returned: cards.length, cards });
    }
    return Response.json({ error: { code: 'NOT_FOUND', message: 'x' } }, { status: 404 });
  });
}

function setup(session: typeof guest | typeof learner = guest) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <StartCard meta={META} session={session} /> },
      { path: '/loop', element: <p>loop page</p> },
    ],
    { initialEntries: ['/'] },
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return router;
}

const field = (label: string) =>
  screen.getByLabelText(label, { exact: true }).closest('[data-default]');
const TOAST = 'Sign-in to choose more cards per session.';
/** The toast's text is split: a "Sign-in" link, then the rest of the sentence (D-043). */
const toastShown = () => screen.queryAllByRole('status').some((s) => s.textContent === TOAST);
/** On desktop the message covers the Amount field instead of a toast (D-044). */
const fieldTipShown = () => document.querySelector('.amount-tip')?.textContent === TOAST;
const shown = () => toastShown() || fieldTipShown();

beforeEach(() => {
  window.sessionStorage.clear();
  window.turnstile = {
    render: vi.fn((_el, opts) => {
      (window as unknown as { __cb: (t: string) => void }).__cb = opts.callback;
      return 'w1';
    }),
    execute: vi.fn(() => (window as unknown as { __cb: (t: string) => void }).__cb('test-token')),
    reset: vi.fn(),
    remove: vi.fn(),
  };
});
afterEach(() => vi.restoreAllMocks());

describe('StartCard', () => {
  it('starts with every field in the default style and the available count', async () => {
    mockApi();
    setup();
    for (const label of ['From', 'To', 'Topic'])
      expect(field(label)).toHaveAttribute('data-default', 'true');
    expect(screen.getAllByText('Default')).toHaveLength(5);
    expect(await screen.findByText('6 new cards available')).toBeInTheDocument();
    expect(screen.queryByText('Reset to defaults')).not.toBeInTheDocument();
  });

  it('puts Start above the settings on phones and below them on wider screens', () => {
    mockApi();
    const startBeforeHeading = () =>
      Boolean(
        screen
          .getByRole('button', { name: 'Start' })
          .compareDocumentPosition(
            screen.getByRole('heading', { name: 'Configure your session' }),
          ) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
    setup(learner); // no matchMedia in jsdom: the desktop layout
    expect(startBeforeHeading()).toBe(false);
    cleanup();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    setup(learner);
    expect(startBeforeHeading()).toBe(true);
    vi.unstubAllGlobals();
  });

  it('switches a changed field to the selected style and offers a reset', () => {
    mockApi();
    setup(learner);
    fireEvent.change(screen.getByLabelText('Topic', { exact: true }), { target: { value: '1' } });
    expect(field('Topic')).toHaveAttribute('data-default', 'false');
    fireEvent.click(screen.getByRole('radio', { name: '20' }));
    fireEvent.click(screen.getByText('Reset to defaults'));
    expect(field('Topic')).toHaveAttribute('data-default', 'true');
    expect(screen.getByRole('radio', { name: '10' })).toHaveAttribute('aria-checked', 'true');
  });

  it('notes when the back will show an explanation', () => {
    mockApi();
    setup();
    fireEvent.change(screen.getByLabelText('To', { exact: true }), { target: { value: 'en' } });
    expect(screen.getByRole('note')).toHaveTextContent(
      'Same language: the back shows an explanation',
    );
  });

  it('locks the guest amount at 5 and shows the sign-in message once per session and on tap', async () => {
    mockApi();
    setup(); // no matchMedia in jsdom: desktop, so the message covers the Amount field (D-044)
    await waitFor(() => expect(fieldTipShown()).toBe(true));
    expect(toastShown()).toBe(false);
    // "Sign-in" is a link that starts sign-in; there is no separate button.
    expect(screen.getByRole('button', { name: 'Sign-in' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign-in with Google' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Amount' })).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem('myvocab.guestAmountToast')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: /Amount: 5/ }));
    expect(fieldTipShown()).toBe(true);
  });

  it('on phones the guest message is a toast, not over the field', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    mockApi();
    setup();
    await waitFor(() => expect(toastShown()).toBe(true));
    expect(fieldTipShown()).toBe(false);
    vi.unstubAllGlobals();
  });

  it('does not show the guest toast automatically twice in a session', () => {
    window.sessionStorage.setItem('myvocab.guestAmountToast', '1');
    mockApi();
    setup();
    expect(shown()).toBe(false);
  });

  it('learners choose the amount and see no guest toast', () => {
    mockApi();
    setup(learner);
    expect(screen.getByRole('radiogroup', { name: 'Amount' })).toBeInTheDocument();
    expect(shown()).toBe(false);
  });

  it('Start runs the bot check for guests, saves the loop and opens it', async () => {
    const fetchSpy = mockApi();
    const router = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/loop'));
    const post = fetchSpy.mock.calls.find(([u]) => u === '/api/loops');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      source: 'en',
      target: 'he',
      type: 'word',
      topicId: null,
      turnstileToken: 'test-token',
    });
    expect(loadLoop()?.cards).toHaveLength(2);
    expect(router.state.location.state).toEqual({
      insufficient: 'Only 2 new cards in Sample set, starting with 2',
    });
  });

  it('shows server errors such as the hourly cap', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input).startsWith('/api/loops/available')
        ? Response.json({ available: 6 })
        : Response.json(
            { error: { code: 'RATE_LIMITED', message: 'Too many sessions for now.' } },
            { status: 429 },
          ),
    );
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many sessions for now.');
  });

  describe('the sample set (D-038)', () => {
    const topic = () => screen.getByLabelText('Topic', { exact: true }) as HTMLSelectElement;
    const option = (name: string) =>
      [...topic().options].find((o) => o.textContent?.trim() === name) as HTMLOptionElement;

    it('guests get the Sample set, with every other topic greyed out and locked', () => {
      mockApi();
      setup();
      expect(topic().value).toBe('sample');
      expect(option('Sample set').disabled).toBe(false);
      expect(option('All topics').disabled).toBe(true);
      expect(option('Home').disabled).toBe(true);
      expect(topic()).toHaveAccessibleDescription('Sign-in to choose any topic.');
    });

    it('learners see no Sample set option', () => {
      mockApi();
      setup(learner);
      expect(option('Sample set')).toBeUndefined();
      expect(topic().value).toBe('');
    });

    it('admins can pick the Sample set, which the count and the session ask for', async () => {
      const fetchSpy = mockApi();
      const router = setup(admin);
      fireEvent.change(topic(), { target: { value: 'sample' } });
      expect(topic().value).toBe('sample');
      await waitFor(() =>
        expect(
          fetchSpy.mock.calls.some(
            ([u]) =>
              String(u).includes('/api/loops/available?') && String(u).includes('sample=true'),
          ),
        ).toBe(true),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      await waitFor(() => expect(router.state.location.pathname).toBe('/loop'));
      const post = fetchSpy.mock.calls.find(([u]) => u === '/api/loops');
      expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ topicId: null, sample: true });
      expect(loadLoop()?.selection.sample).toBe(true);
    });
  });

  it('lists the real topics under a "Topics" heading, apart from "All topics" (D-040)', () => {
    mockApi();
    setup(learner);
    const topic = screen.getByLabelText('Topic', { exact: true }) as HTMLSelectElement;
    const byName = (name: string) => [...topic.options].find((o) => o.textContent === name);
    expect(byName('All topics')?.parentElement).toBe(topic);
    const group = byName('Home')?.parentElement;
    expect(group?.tagName).toBe('OPTGROUP');
    expect(group).toHaveAttribute('label', 'Topics');
  });
});
