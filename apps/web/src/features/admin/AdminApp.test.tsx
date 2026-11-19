import type { AdminItem, SessionUser } from '@myvocab/contracts';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, renderRoutes, TEST_USER } from '../../test/render';
import { AdminApp } from './AdminApp';

const ADMIN: SessionUser = { ...TEST_USER, role: 'admin' };

// Synthetic content only.
const ITEM: AdminItem = {
  itemId: 7,
  text: 'sample-item',
  type: 'word',
  lang: 'en',
  multipleMeanings: false,
  categoryIds: [],
  categories: [],
  parallel: {},
  meaning: { he: ['מילה'] },
  literal: {},
  explanation: [],
  synonyms: [],
  hints: ['First hint.'],
  status: 'published',
  version: 1,
  createdAt: 1,
  updatedAt: 1,
  warnings: [
    { path: 'explanation', code: 'NOT_PLAYABLE', message: 'No explanation: not playable EN → EN' },
  ],
  playableTargets: ['he'],
};

const LANGUAGES = {
  languages: [
    {
      code: 'en',
      name: 'English',
      nativeName: 'English',
      dir: 'ltr',
      script: 'Latn',
      isActive: true,
      sortOrder: 0,
    },
    {
      code: 'he',
      name: 'Hebrew',
      nativeName: 'עברית',
      dir: 'rtl',
      script: 'Hebr',
      isActive: true,
      sortOrder: 1,
    },
  ],
};

function render(path: string, routes: Parameters<typeof mockFetch>[0], user: SessionUser = ADMIN) {
  mockFetch(
    {
      'GET /api/admin/languages': () => Response.json(LANGUAGES),
      'GET /api/admin/categories': () => Response.json({ categories: [] }),
      'GET /api/admin/items/7/preview': () => Response.json([]),
      ...routes,
    },
    user,
  );
  return renderRoutes([{ path: '/admin/*', element: <AdminApp /> }], [path]);
}

afterEach(() => vi.restoreAllMocks());

describe('AdminApp', () => {
  it('shows "Admins only" to non-admins', async () => {
    render('/admin', {}, TEST_USER);
    expect(await screen.findByRole('heading', { name: 'Admins only' })).toBeVisible();
  });

  it('item editor: shows warnings, a fixed language and the translation list for the other language', async () => {
    render('/admin/items/7', { 'GET /api/admin/items/7': () => Response.json(ITEM) });
    expect(await screen.findByRole('heading', { name: 'sample-item', level: 1 })).toBeVisible();
    expect(screen.getByText('No explanation: not playable EN → EN')).toBeVisible();
    expect(screen.getByText(/language is fixed after creation/)).toBeVisible();
    // The three kinds of translation for the other language (D-024).
    for (const name of [
      'Hebrew meaning (required)',
      'Hebrew parallel',
      'Hebrew literal translation',
    ])
      expect(screen.getByRole('heading', { name })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'English translation' })).toBeNull();
  });

  it('a list change saves with the item version; a 409 reloads the item and says why', async () => {
    let version = 1;
    const patches: unknown[] = [];
    render('/admin/items/7', {
      'GET /api/admin/items/7': () =>
        Response.json(
          version === 1 ? ITEM : { ...ITEM, version: 2, hints: ['Changed elsewhere.'] },
        ),
      'PATCH /api/admin/items/7': (init) => {
        patches.push(JSON.parse(String(init?.body)));
        version = 2;
        return Response.json(
          { error: { code: 'CONFLICT', message: 'stale', details: { reason: 'stale' } } },
          { status: 409 },
        );
      },
    });
    const hints = (await screen.findByRole('heading', { name: 'Hints' })).closest('section')!;
    const input = within(hints).getByLabelText('Add to hints and press Enter');
    fireEvent.change(input, { target: { value: 'Second hint.' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(patches).toEqual([{ version: 1, hints: ['First hint.', 'Second hint.'] }]),
    );
    expect(
      await screen.findByText(
        'This item was changed by someone else. Your last change was not saved.',
      ),
    ).toBeVisible();
    expect(await within(hints).findByText('Changed elsewhere.')).toBeVisible();
  });

  it('settings: "Maximum amount" explains itself under the field', async () => {
    render('/admin/settings', { 'GET /api/admin/settings': () => Response.json({}) });
    const field = await screen.findByLabelText('Maximum amount');
    expect(field).toHaveAccessibleDescription(
      'The largest amount allowed in the amount choices above. Settings won’t save if a choice is bigger.',
    );
  });
});
