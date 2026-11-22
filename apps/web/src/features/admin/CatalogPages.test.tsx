import type { AdminLanguage, SessionUser } from '@myvocab/contracts';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, renderRoutes, TEST_USER } from '../../test/render';
import { AdminApp } from './AdminApp';
import { slugify } from './CatalogPages';

const ADMIN: SessionUser = { ...TEST_USER, role: 'admin' };

// Synthetic topics only.
const EXISTING = {
  id: 1,
  slug: 'sample-one',
  name: 'Sample One',
  nameHe: null,
  isActive: true,
  sortOrder: 0,
  itemCount: 0,
  excludesTopicId: null,
};

function setup() {
  const posts: unknown[] = [];
  mockFetch(
    {
      'GET /api/admin/topics': () => Response.json({ topics: [EXISTING] }),
      'POST /api/admin/topics': (init) => {
        posts.push(JSON.parse(String(init?.body)));
        return Response.json({ ...EXISTING, id: 2, slug: 'x', name: 'x' }, { status: 201 });
      },
    },
    ADMIN,
  );
  renderRoutes([{ path: '/admin/*', element: <AdminApp /> }], ['/admin/topics']);
  return posts;
}

afterEach(() => vi.restoreAllMocks());

describe('slugify', () => {
  it('turns a name into a slug', () => {
    expect(slugify('Home & Garden')).toBe('home-garden');
    expect(slugify('  Crème Brûlée 2 ')).toBe('creme-brulee-2');
    expect(slugify('אוכל')).toBe('');
  });
});

describe('TopicsPage add form (FR-A30)', () => {
  it('fills the slug from the name and adds the topic', async () => {
    const posts = setup();
    await screen.findByText('Sample One');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Home & Garden' } });
    expect(screen.getByLabelText('Slug')).toHaveValue('home-garden');
    expect(
      screen.getByText('Used in CSV files. Lowercase letters, digits and dashes.'),
    ).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '+ Add topic' }));
    await waitFor(() =>
      expect(posts).toEqual([{ slug: 'home-garden', name: 'Home & Garden', nameHe: '' }]),
    );
  });

  it('stops following the name once the slug is edited', async () => {
    setup();
    await screen.findByText('Sample One');
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'garden' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Home & Garden' } });
    expect(screen.getByLabelText('Slug')).toHaveValue('garden');
  });

  it('reports a bad or used slug under the field and keeps Add disabled', async () => {
    setup();
    await screen.findByText('Sample One');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Anything' } });
    const slugInput = screen.getByLabelText('Slug');
    const add = screen.getByRole('button', { name: '+ Add topic' });

    fireEvent.change(slugInput, { target: { value: 'home garden' } });
    expect(screen.getByText(/Use lowercase English letters/)).toBeVisible();
    expect(slugInput).toHaveAttribute('aria-invalid', 'true');
    expect(add).toBeDisabled();

    fireEvent.change(slugInput, { target: { value: 'sample-one' } });
    expect(screen.getByText('Already used by “Sample One”.')).toBeVisible();
    expect(add).toBeDisabled();
  });

  it('asks for a slug when the name has no English letters', async () => {
    setup();
    await screen.findByText('Sample One');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'אוכל' } });
    expect(screen.getByLabelText('Slug')).toHaveValue('');
    expect(screen.getByText('Type a slug in English letters, e.g. food.')).toBeVisible();
    expect(screen.getByRole('button', { name: '+ Add topic' })).toBeDisabled();
  });
});

describe('LanguagesPage (FR-A35, D-027)', () => {
  const LANGS: AdminLanguage[] = [
    {
      code: 'en',
      name: 'English',
      nativeName: 'English',
      dir: 'ltr',
      script: 'Latn',
      isActive: true,
      sortOrder: 1,
    },
    {
      code: 'he',
      name: 'Hebrew',
      nativeName: 'עברית',
      dir: 'rtl',
      script: 'Hebr',
      isActive: true,
      sortOrder: 2,
    },
  ];

  function setupLanguages() {
    const posts: unknown[] = [];
    const patches: { url: string; body: unknown }[] = [];
    let languages = [...LANGS];
    mockFetch(
      {
        'GET /api/admin/languages': () => Response.json({ languages }),
        'POST /api/admin/languages': (init) => {
          const body = JSON.parse(String(init?.body)) as Omit<
            AdminLanguage,
            'isActive' | 'sortOrder'
          >;
          posts.push(body);
          languages = [...languages, { ...body, isActive: false, sortOrder: 3 }];
          return Response.json({ languages }, { status: 201 });
        },
        'PATCH /api/admin/languages/he': (init, url) => {
          const body = JSON.parse(String(init?.body)) as Partial<AdminLanguage>;
          patches.push({ url, body });
          languages = languages.map((l) => (l.code === 'he' ? { ...l, ...body } : l));
          return Response.json({ languages });
        },
      },
      ADMIN,
    );
    renderRoutes([{ path: '/admin/*', element: <AdminApp /> }], ['/admin/languages']);
    return { posts, patches };
  }

  it('a preset fills the details; the new language is added inactive', async () => {
    const { posts } = setupLanguages();
    const preset = await screen.findByLabelText('Language');
    // Languages that already exist are not offered.
    const options = within(preset)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toContain('Arabic (العربية)');
    expect(options).not.toContain('Hebrew (עברית)');
    expect(options.at(-1)).toBe('Other (type the details)');

    fireEvent.change(preset, { target: { value: 'ar' } });
    expect(screen.getByLabelText('Code')).toHaveValue('ar');
    expect(screen.getByLabelText('Name (in English)')).toHaveValue('Arabic');
    expect(screen.getByLabelText('Native name')).toHaveValue('العربية');
    expect(screen.getByLabelText('Script')).toHaveValue('Arab');
    expect(screen.getByRole('radio', { name: 'Right to left' })).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: '+ Add language' }));
    await waitFor(() =>
      expect(posts).toEqual([
        { code: 'ar', name: 'Arabic', nativeName: 'العربية', dir: 'rtl', script: 'Arab' },
      ]),
    );
    const row = (await screen.findByText('Arabic')).closest('li')!;
    expect(within(row).getByRole('checkbox', { name: 'Arabic active' })).not.toBeChecked();
    expect(within(row).getByText('Inactive')).toBeVisible();
    expect(await screen.findByText('Arabic added (inactive)')).toBeVisible();
  });

  it('"Other" starts empty and checks the code and script before Add', async () => {
    setupLanguages();
    fireEvent.change(await screen.findByLabelText('Language'), { target: { value: 'other' } });
    expect(screen.getByLabelText('Code')).toHaveValue('');
    const add = screen.getByRole('button', { name: '+ Add language' });
    expect(add).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'he' } });
    expect(screen.getByText('Already used by Hebrew.')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'x1' } });
    expect(screen.getByText(/Use 2–3 lowercase letters/)).toBeVisible();
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'sw' } });
    fireEvent.change(screen.getByLabelText('Name (in English)'), { target: { value: 'Swahili' } });
    fireEvent.change(screen.getByLabelText('Native name'), { target: { value: 'Kiswahili' } });
    fireEvent.change(screen.getByLabelText('Script'), { target: { value: 'Abcd' } });
    expect(screen.getByText(/Unknown script code/)).toBeVisible();
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Script'), { target: { value: 'Latn' } });
    expect(add).toBeEnabled();
  });

  it('renames a language', async () => {
    const { patches } = setupLanguages();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Hebrew' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name (in English)' }), {
      target: { value: 'Modern Hebrew' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(patches.map((p) => p.body)).toEqual([{ name: 'Modern Hebrew', nativeName: 'עברית' }]),
    );
    expect(await screen.findByText('Modern Hebrew')).toBeVisible();
  });
});
