import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/Toast';
import { makeCard, META } from '../../test/fixtures';
import { loadPractice } from '../practice/practice-storage';
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

type Counts = { all: number; sample: number; topics: Record<string, number> };
/** One count for everything unless `counts` says otherwise (D-064). */
const countsOf = (n: number, counts: Partial<Counts> = {}): Counts => ({
  all: n,
  sample: n,
  topics: { '1': n },
  ...counts,
});

function mockApi(cards = [makeCard(1), makeCard(2)], available = 6, counts?: Partial<Counts>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.startsWith('/api/practices/available-by-topic')) {
      return Response.json(countsOf(available, counts));
    }
    if (url === '/api/practices' && init?.method === 'POST') {
      return Response.json({ requested: 5, returned: cards.length, cards });
    }
    return Response.json({ error: { code: 'NOT_FOUND', message: 'x' } }, { status: 404 });
  });
}

function setup(session: typeof guest | typeof learner = guest) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <StartCard meta={META} session={session} /> },
      { path: '/practice', element: <p>practice page</p> },
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
const TOAST = 'Sign-in to change';
/** The "N cards available" line's text. */
const availableLine = () =>
  screen.queryAllByText(
    (_, el) => el?.tagName === 'P' && /cards? available$/.test(el.textContent ?? ''),
  )[0]?.textContent;
/** The toast's text is split: a "Sign-in" link, then the rest of the sentence (D-043). */
const toastShown = () => screen.queryAllByRole('status').some((s) => s.textContent === TOAST);
/** The message covers the Cards per practice field, never a toast (D-044, D-070). */
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
    expect(screen.getAllByText('Default')).toHaveLength(4); // From, To, Topic, Amount (no Type, D-046)
    expect(
      await screen.findByText(
        (_, el) => el?.tagName === 'P' && el.textContent === '6 cards available',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Reset to defaults')).not.toBeInTheDocument();
  });

  it('puts Start above the settings on phones and below them on wider screens', () => {
    mockApi();
    const startBeforeHeading = () =>
      Boolean(
        screen
          .getByRole('button', { name: 'Start' })
          .compareDocumentPosition(
            screen.getByRole('heading', { name: 'Configure your practice' }),
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

  it('greys out the amounts above the available count (D-057)', async () => {
    mockApi(undefined, 23);
    setup(learner);
    const radio = (n: string) => screen.getByRole('radio', { name: n });
    await waitFor(() => expect(radio('30')).toBeDisabled());
    expect(radio('40')).toBeDisabled();
    expect(radio('50')).toBeDisabled();
    expect(radio('10')).toBeEnabled();
    expect(radio('20')).toBeEnabled();
  });

  it('shows a chosen amount above the count as the largest allowed one (D-057)', async () => {
    mockApi(undefined, 6);
    setup(learner);
    fireEvent.click(screen.getByRole('radio', { name: '50' })); // before the count arrives
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: '10' })).toHaveAttribute('aria-checked', 'true'),
    );
    expect(screen.getByRole('radio', { name: '50' })).toBeDisabled();
  });

  it('switches From and To, and disables the switch when they match (D-055)', () => {
    mockApi();
    setup(learner);
    const from = screen.getByLabelText<HTMLSelectElement>('From', { exact: true });
    const to = screen.getByLabelText<HTMLSelectElement>('To', { exact: true });
    const swap = screen.getByRole('button', { name: 'Switch From and To' });
    const [a, b] = [from.value, to.value];
    fireEvent.click(swap);
    expect([from.value, to.value]).toEqual([b, a]);
    fireEvent.change(to, { target: { value: b } });
    expect(swap).toBeDisabled();
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
    expect(
      screen.queryByRole('radiogroup', { name: 'Cards per practice' }),
    ).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem('myvocab.guestAmountToast')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: /Cards per practice: 5/ }));
    expect(fieldTipShown()).toBe(true);
  });

  it('on phones too the guest message covers the field, not a toast (D-070)', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    mockApi();
    setup();
    await waitFor(() => expect(fieldTipShown()).toBe(true));
    expect(toastShown()).toBe(false);
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
    expect(screen.getByRole('radiogroup', { name: 'Cards per practice' })).toBeInTheDocument();
    expect(shown()).toBe(false);
  });

  it('Start runs the bot check for guests, saves the practice and opens it', async () => {
    const fetchSpy = mockApi();
    const router = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/practice'));
    const post = fetchSpy.mock.calls.find(([u]) => u === '/api/practices');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      source: 'en',
      target: 'he',
      topicId: null,
      turnstileToken: 'test-token',
    });
    expect(loadPractice()?.cards).toHaveLength(2);
    expect(router.state.location.state).toEqual({
      insufficient: 'Only 2 new cards in Sample set, starting with 2',
    });
  });

  it('shows server errors such as the hourly cap', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input).startsWith('/api/practices/available-by-topic')
        ? Response.json(countsOf(6))
        : Response.json(
            { error: { code: 'RATE_LIMITED', message: 'Too many practices for now.' } },
            { status: 429 },
          ),
    );
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many practices for now.');
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
    });

    it('learners see no Sample set option', () => {
      mockApi();
      setup(learner);
      expect(option('Sample set')).toBeUndefined();
      expect(topic().value).toBe('');
    });

    it('admins can pick the Sample set, which the count and the practice use', async () => {
      const fetchSpy = mockApi(undefined, 9, { sample: 4 });
      const router = setup(admin);
      fireEvent.change(topic(), { target: { value: 'sample' } });
      expect(topic().value).toBe('sample');
      await waitFor(() => expect(availableLine()).toBe('4 cards available'));
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      await waitFor(() => expect(router.state.location.pathname).toBe('/practice'));
      const post = fetchSpy.mock.calls.find(([u]) => u === '/api/practices');
      expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ topicId: null, sample: true });
      expect(loadPractice()?.selection.sample).toBe(true);
    });
  });

  it('shows each option’s count and greys out a topic with none left (D-064)', async () => {
    mockApi(undefined, 9, { sample: 4, topics: {} });
    setup(admin);
    const topic = screen.getByLabelText('Topic', { exact: true }) as HTMLSelectElement;
    await waitFor(() =>
      expect([...topic.options].map((o) => o.textContent)).toEqual([
        'Sample set [4]',
        'All topics [9]',
        'Home [0]',
      ]),
    );
    expect([...topic.options].map((o) => o.disabled)).toEqual([false, false, true]);
  });

  it('asks once per direction; changing the topic reads the same counts (D-064)', async () => {
    const fetchSpy = mockApi(undefined, 9, { topics: { '1': 3 } });
    setup(learner);
    const calls = () =>
      fetchSpy.mock.calls.filter(([u]) =>
        String(u).startsWith('/api/practices/available-by-topic'),
      );
    await waitFor(() => expect(availableLine()).toBe('9 cards available'));
    fireEvent.change(screen.getByLabelText('Topic', { exact: true }), { target: { value: '1' } });
    expect(availableLine()).toBe('3 cards available');
    expect(calls()).toHaveLength(1);
    expect(String(calls()[0]![0])).toBe('/api/practices/available-by-topic?source=en&target=he');
  });

  it('guests see the full counts on their locked topics, none on "Sample set" (D-064, D-065)', async () => {
    mockApi(undefined, 9, { sample: 5, topics: { '1': 4 } });
    setup();
    const topic = screen.getByLabelText('Topic', { exact: true }) as HTMLSelectElement;
    await waitFor(() =>
      expect([...topic.options].map((o) => o.textContent)).toEqual([
        'Sample set',
        'All topics [9]',
        'Home [4]',
      ]),
    );
    expect(availableLine()).toBe('5 cards available');
  });

  it('lists the topics under a line, apart from "All topics", all at the top level (D-062)', () => {
    mockApi();
    setup(learner);
    const topic = screen.getByLabelText('Topic', { exact: true }) as HTMLSelectElement;
    expect([...topic.children].map((c) => (c.tagName === 'HR' ? '---' : c.textContent))).toEqual([
      'All topics',
      '---',
      'Home',
    ]);
    expect(topic.querySelector('optgroup')).toBeNull();
  });
});
