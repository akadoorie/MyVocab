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
  lang: 'en',
  multipleMeanings: false,
  topicIds: [],
  topics: [],
  parallel: {},
  meaning: { he: ['מילה'] },
  literal: {},
  explanation: [],
  synonyms: [],
  hints: ['First hint.'],
  status: 'published',
  inSampleSet: true,
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
      'GET /api/admin/topics': () => Response.json({ topics: [] }),
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

  it('literal: "Same as the parallel" saves the marker and replaces the list (D-026)', async () => {
    const IDIOM = {
      ...ITEM,
      meaning: { he: ['משמעות'] },
      parallel: { he: ['מקבילה'] },
      literal: {},
    };
    let current: typeof IDIOM = IDIOM;
    const patches: unknown[] = [];
    render('/admin/items/7', {
      'GET /api/admin/items/7': () => Response.json(current),
      'PATCH /api/admin/items/7': (init) => {
        const body = JSON.parse(String(init?.body)) as { literal: Record<string, string[]> };
        patches.push(body);
        current = { ...current, literal: body.literal, version: current.version + 1 };
        return Response.json(current);
      },
    });
    const literal = (
      await screen.findByRole('heading', { name: 'Hebrew literal translation' })
    ).closest('section')!;
    fireEvent.click(within(literal).getByRole('checkbox', { name: 'Same as the parallel' }));
    await waitFor(() => expect(patches).toEqual([{ version: 1, literal: { he: ['=parallel'] } }]));
    expect(
      await within(literal).findByText(/The parallel is also the word-for-word translation/),
    ).toBeVisible();
    expect(within(literal).queryByLabelText(/Add to/)).toBeNull();
    expect(within(literal).getByRole('checkbox', { name: 'Same as the parallel' })).toBeChecked();
  });

  it('preview: opens on the other language and says what a direction that is not ready needs', async () => {
    render('/admin/items/7', { 'GET /api/admin/items/7': () => Response.json(ITEM) });
    const picker = await screen.findByRole('group', { name: 'Show the answer in' });
    const hebrew = within(picker).getByRole('button', { name: 'Hebrew, ready' });
    const english = within(picker).getByRole('button', { name: 'English, not shown yet' });
    // The translation language comes first and is chosen; the item's own language is last.
    expect(within(picker).getAllByRole('button')).toEqual([hebrew, english]);
    expect(hebrew).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'English → Hebrew · Translation' })).toBeVisible();

    fireEvent.click(english);
    expect(english).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'English → English · Explanation' })).toBeVisible();
    expect(screen.getByText('Not shown to learners yet: add an explanation.')).toBeVisible();
  });

  it('preview: a Hebrew item opens on English', async () => {
    const hebrewItem: AdminItem = {
      ...ITEM,
      lang: 'he',
      text: 'פריט-לדוגמה',
      meaning: { en: ['sample'] },
      explanation: ['הסבר'],
      warnings: [],
      playableTargets: ['en', 'he'],
    };
    render('/admin/items/7', { 'GET /api/admin/items/7': () => Response.json(hebrewItem) });
    const picker = await screen.findByRole('group', { name: 'Show the answer in' });
    expect(within(picker).getByRole('button', { name: 'English, ready' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('heading', { name: 'Hebrew → English · Translation' })).toBeVisible();
  });

  it('editor: an inactive language gets its own marked block and preview button (D-027)', async () => {
    const withArabic = {
      languages: [
        ...LANGUAGES.languages,
        {
          code: 'ar',
          name: 'Arabic',
          nativeName: 'العربية',
          dir: 'rtl',
          script: 'Arab',
          isActive: false,
          sortOrder: 2,
        },
      ],
    };
    render('/admin/items/7', {
      'GET /api/admin/items/7': () => Response.json(ITEM),
      'GET /api/admin/languages': () => Response.json(withArabic),
    });
    expect(await screen.findByRole('heading', { name: 'Arabic meaning (required)' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Hebrew meaning (required)' })).toBeVisible();
    expect(screen.getByText(/^Arabic is inactive: learners don’t see it yet\./)).toBeVisible();

    const picker = screen.getByRole('group', { name: 'Show the answer in' });
    const arabic = within(picker).getByRole('button', { name: 'Arabic, not shown yet, inactive' });
    // The active, ready translation language is still the default.
    expect(within(picker).getByRole('button', { name: 'Hebrew, ready' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(arabic);
    expect(screen.getByRole('heading', { name: 'English → Arabic · Translation' })).toBeVisible();
    expect(screen.getByText('Not shown to learners yet: add a meaning in Arabic.')).toBeVisible();
    expect(screen.getByText(/^Arabic is inactive: learners won’t see this card/)).toBeVisible();
  });

  it('topics: the pairing lists topic names, "— (none)" first; an inactive topic has no badge (D-061)', async () => {
    const topic = (id: number, name: string, extra = {}) => ({
      id,
      slug: name.toLowerCase(),
      name,
      nameHe: null,
      isActive: true,
      sortOrder: id,
      itemCount: 0,
      excludesTopicId: null,
      ...extra,
    });
    render('/admin/topics', {
      'GET /api/admin/topics': () =>
        Response.json({
          topics: [
            topic(1, 'Home', { excludesTopicId: 2 }),
            topic(2, 'Nature', { excludesTopicId: 1 }),
            topic(3, 'Travel', { isActive: false }),
          ],
        }),
    });
    const home = await screen.findByRole('combobox', { name: "Home: can't be combined with" });
    expect(
      within(home)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['— (none)', 'Nature', 'Travel']);
    expect(home).toHaveValue('2');
    expect(screen.getByRole('checkbox', { name: 'Travel active' })).not.toBeChecked();
    expect(screen.queryByText('Inactive')).not.toBeInTheDocument();
  });

  describe('topics: moving one with the arrows (D-076)', () => {
    const topic = (id: number, name: string) => ({
      id,
      slug: name.toLowerCase(),
      name,
      nameHe: null,
      isActive: true,
      sortOrder: id,
      itemCount: 0,
      excludesTopicId: null,
    });
    const names = () =>
      [...document.querySelectorAll('ul[aria-label="Topics"] li[data-id]')].map(
        (li) => li.querySelector('p')?.textContent,
      );

    it('moves at once, before the server answers', async () => {
      let answer: (r: Response) => void = () => undefined;
      render('/admin/topics', {
        'GET /api/admin/topics': () =>
          Response.json({ topics: [topic(1, 'Home'), topic(2, 'Nature')] }),
        'PUT /api/admin/topics/order': () => new Promise<Response>((r) => (answer = r)),
      });
      fireEvent.click(await screen.findByRole('button', { name: 'Home ↓' }));
      await waitFor(() => expect(names()).toEqual(['Nature', 'Home']));
      answer(Response.json({ topics: [topic(2, 'Nature'), topic(1, 'Home')] }));
    });

    it('goes back if the server refuses', async () => {
      let answer: (r: Response) => void = () => undefined;
      render('/admin/topics', {
        'GET /api/admin/topics': () =>
          Response.json({ topics: [topic(1, 'Home'), topic(2, 'Nature')] }),
        'PUT /api/admin/topics/order': () => new Promise<Response>((r) => (answer = r)),
      });
      fireEvent.click(await screen.findByRole('button', { name: 'Home ↓' }));
      await waitFor(() => expect(names()).toEqual(['Nature', 'Home']));
      answer(Response.json({ error: { code: 'INTERNAL', message: 'nope' } }, { status: 500 }));
      await waitFor(() => expect(names()).toEqual(['Home', 'Nature']));
    });
  });

  it('settings: Save and Discard (top and bottom) are off until a value changes; Discard restores it (D-119, D-120)', async () => {
    render('/admin/settings', { 'GET /api/admin/settings': () => Response.json({}) });
    const field = (await screen.findByLabelText('Cards per practice: maximum')) as HTMLInputElement;
    const saves = screen.getAllByRole('button', { name: 'Save' });
    const discards = screen.getAllByRole('button', { name: 'Discard' });
    expect(saves).toHaveLength(2);
    expect(discards).toHaveLength(2);
    for (const b of [...saves, ...discards]) expect(b).toBeDisabled();
    const before = field.value;
    fireEvent.change(field, { target: { value: String(Number(before) + 1) } });
    for (const b of [...saves, ...discards]) expect(b).toBeEnabled();
    fireEvent.change(field, { target: { value: before } });
    for (const b of saves) expect(b).toBeDisabled();
    fireEvent.change(field, { target: { value: String(Number(before) + 2) } });
    fireEvent.click(discards[0]!);
    expect(field.value).toBe(before);
    for (const b of [...saves, ...discards]) expect(b).toBeDisabled();
  });

  it('settings: "Cards per practice: maximum" explains itself under the field', async () => {
    render('/admin/settings', { 'GET /api/admin/settings': () => Response.json({}) });
    const field = await screen.findByLabelText('Cards per practice: maximum');
    expect(field).toHaveAccessibleDescription(
      'The largest number allowed in the choices above. Settings won’t save if a choice is bigger.',
    );
  });
});
