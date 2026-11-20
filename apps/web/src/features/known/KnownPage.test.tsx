import type { KnownItem } from '@myvocab/contracts';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, renderRoutes } from '../../test/render';
import { KnownPage } from './KnownPage';

// Synthetic data only.
const ITEMS: KnownItem[] = [
  {
    itemId: 11,
    text: 'sample-one',
    lang: 'en',
    dir: 'ltr',
    type: 'word',
    multipleMeanings: true,
    knownTarget: 'he',
    answer: {
      kind: 'translation',
      lines: ['מילה-1', 'מילה-2'],
      numbered: false,
      lang: 'he',
      dir: 'rtl',
    },
    categories: [{ id: 1, name: 'Home' }],
    knownAt: Date.UTC(2026, 10, 1),
    knownInCycle: 1,
  },
  {
    itemId: 12,
    text: 'sample-two',
    lang: 'en',
    dir: 'ltr',
    type: 'expr',
    multipleMeanings: false,
    knownTarget: 'en',
    answer: {
      kind: 'explanation',
      lines: ['First meaning', 'Second meaning'],
      numbered: true,
      lang: 'en',
      dir: 'ltr',
    },
    categories: [],
    knownAt: Date.UTC(2026, 10, 2),
    knownInCycle: 3,
  },
];

const page = (
  items = ITEMS,
  total: number | null = items.length,
  nextCursor: string | null = null,
) => Response.json({ items, total, nextCursor });

function setup(routes: Parameters<typeof mockFetch>[0], user?: Parameters<typeof mockFetch>[1]) {
  const fetchSpy = mockFetch(routes, user);
  renderRoutes([{ path: '/known', element: <KnownPage /> }], ['/known']);
  return fetchSpy;
}

afterEach(() => vi.restoreAllMocks());

describe('KnownPage', () => {
  it('asks guests to sign in', async () => {
    setup({}, null);
    expect(await screen.findByRole('heading', { name: 'Sign in to continue' })).toBeVisible();
  });

  it('lists known items with direction, answer, categories and the cycle badge', async () => {
    setup({ 'GET /api/me/known': () => page() });
    const list = await screen.findByRole('list', { name: 'My known words' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('sample-one')).toHaveAttribute('dir', 'ltr');
    expect(within(rows[0]!).getByText('מילה-1, מילה-2')).toHaveAttribute('dir', 'rtl');
    expect(within(rows[0]!).getByText('EN → HE:', { exact: false })).toBeVisible();
    expect(within(rows[0]!).getByText('Multiple meanings')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Home')).toBeVisible();
    expect(within(rows[0]!).getByText('Already knew')).toBeVisible();
    expect(within(rows[1]!).getByText('1. First meaning; 2. Second meaning')).toBeVisible();
    expect(within(rows[1]!).getByText('Learned here')).toBeVisible();
    expect(screen.getByText('2 known words')).toBeVisible();
  });

  it('returns one row to the loops', async () => {
    const restore = vi.fn((_init: RequestInit | undefined) => Response.json({ restored: 1 }));
    setup({ 'GET /api/me/known': () => page(), 'POST /api/me/known/restore': restore });
    const rows = await screen.findAllByRole('listitem');
    fireEvent.click(within(rows[0]!).getByRole('button', { name: 'Return to practice' }));
    await waitFor(() => expect(restore).toHaveBeenCalled());
    expect(JSON.parse(String(restore.mock.calls[0]![0]!.body))).toEqual({
      marks: [{ itemId: 11, target: 'he' }],
    });
    expect(await screen.findByText('1 word is back in practice')).toBeVisible();
  });

  it('returns selected rows', async () => {
    const restore = vi.fn((_init: RequestInit | undefined) => Response.json({ restored: 2 }));
    setup({ 'GET /api/me/known': () => page(), 'POST /api/me/known/restore': restore });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select sample-one (EN → HE)' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select sample-two (EN → EN)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Return 2 selected' }));
    await waitFor(() => expect(restore).toHaveBeenCalled());
    expect(JSON.parse(String(restore.mock.calls[0]![0]!.body))).toEqual({
      marks: [
        { itemId: 11, target: 'he' },
        { itemId: 12, target: 'en' },
      ],
    });
  });

  it('lists an item known in two directions as two rows, returned separately (D-028)', async () => {
    const restore = vi.fn((_init: RequestInit | undefined) => Response.json({ restored: 1 }));
    const twoWays: KnownItem = {
      ...ITEMS[0]!,
      knownTarget: 'en',
      answer: {
        kind: 'explanation',
        lines: ['An explanation'],
        numbered: false,
        lang: 'en',
        dir: 'ltr',
      },
    };
    setup({
      'GET /api/me/known': () => page([ITEMS[0]!, twoWays]),
      'POST /api/me/known/restore': restore,
    });
    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]!).getByText('EN → EN:', { exact: false })).toBeVisible();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select sample-one (EN → EN)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Return 1 selected' }));
    await waitFor(() => expect(restore).toHaveBeenCalled());
    expect(JSON.parse(String(restore.mock.calls[0]![0]!.body))).toEqual({
      marks: [{ itemId: 11, target: 'en' }],
    });
  });

  it('filters by direction, including the explanation direction (D-028)', async () => {
    const fetchSpy = setup({ 'GET /api/me/known': () => page() });
    const select = await screen.findByLabelText('Direction');
    // The directions come from the languages in /api/meta, which loads separately.
    await within(select).findByRole('option', { name: 'English → Hebrew' });
    const options = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual([
      'All',
      'English → English (explanation)',
      'English → Hebrew',
      'Hebrew → English',
      'Hebrew → Hebrew (explanation)',
    ]);
    fireEvent.change(select, { target: { value: 'en:he' } });
    await waitFor(() =>
      expect(
        fetchSpy.mock.calls.some(([u]) => /lang=en/.test(String(u)) && /target=he/.test(String(u))),
      ).toBe(true),
    );
  });

  it('returns all filtered rows after a confirmation', async () => {
    const restore = vi.fn((_init: RequestInit | undefined) => Response.json({ restored: 1 }));
    const fetchSpy = setup({
      'GET /api/me/known': (_init, url) => (url.includes('type=expr') ? page([ITEMS[1]!]) : page()),
      'POST /api/me/known/restore': restore,
    });
    await screen.findAllByRole('listitem');
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'expr' } });
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    expect(fetchSpy.mock.calls.some(([u]) => String(u).includes('type=expr'))).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Return all 1' }));
    const dialog = screen.getByRole('dialog', { name: 'Return 1 word to practice?' });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Return all 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Return them' }));
    await waitFor(() => expect(restore).toHaveBeenCalled());
    expect(JSON.parse(String(restore.mock.calls[0]![0]!.body))).toEqual({
      filter: { type: 'expr' },
    });
  });

  it('loads more pages with the cursor', async () => {
    setup({
      'GET /api/me/known': (_init, url) =>
        url.includes('cursor=c1') ? page([ITEMS[1]!], null) : page([ITEMS[0]!], 2, 'c1'),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('explains how items get here when the list is empty', async () => {
    setup({ 'GET /api/me/known': () => page([], 0) });
    expect(await screen.findByText('No known words yet')).toBeVisible();
  });
});
