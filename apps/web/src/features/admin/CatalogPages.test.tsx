import type { SessionUser } from '@myvocab/contracts';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, renderRoutes, TEST_USER } from '../../test/render';
import { AdminApp } from './AdminApp';
import { slugify } from './CatalogPages';

const ADMIN: SessionUser = { ...TEST_USER, role: 'admin' };

// Synthetic categories only.
const EXISTING = {
  id: 1,
  slug: 'sample-one',
  name: 'Sample One',
  isActive: true,
  sortOrder: 0,
  itemCount: 0,
};

function setup() {
  const posts: unknown[] = [];
  mockFetch(
    {
      'GET /api/admin/categories': () => Response.json({ categories: [EXISTING] }),
      'POST /api/admin/categories': (init) => {
        posts.push(JSON.parse(String(init?.body)));
        return Response.json({ ...EXISTING, id: 2, slug: 'x', name: 'x' }, { status: 201 });
      },
    },
    ADMIN,
  );
  renderRoutes([{ path: '/admin/*', element: <AdminApp /> }], ['/admin/categories']);
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

describe('CategoriesPage add form (FR-A30)', () => {
  it('fills the slug from the name and adds the category', async () => {
    const posts = setup();
    await screen.findByText('Sample One');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Home & Garden' } });
    expect(screen.getByLabelText('Slug')).toHaveValue('home-garden');
    expect(
      screen.getByText('Used in CSV files. Lowercase letters, digits and dashes.'),
    ).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '+ Add category' }));
    await waitFor(() => expect(posts).toEqual([{ slug: 'home-garden', name: 'Home & Garden' }]));
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
    const add = screen.getByRole('button', { name: '+ Add category' });

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
    expect(screen.getByRole('button', { name: '+ Add category' })).toBeDisabled();
  });
});
