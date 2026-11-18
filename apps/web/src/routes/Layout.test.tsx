import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, renderRoutes } from '../test/render';
import { Layout } from './Layout';

const routes = [
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, element: <p>start page</p> },
      { path: 'known', element: <p>known page</p> },
    ],
  },
];

afterEach(() => vi.restoreAllMocks());

describe('Layout', () => {
  it('offers a Home link on every page except the start page', async () => {
    mockFetch({});
    const { router } = renderRoutes(routes, ['/known']);
    expect(await screen.findByText('known page')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: /Home/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(screen.getByText('start page')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Home/ })).not.toBeInTheDocument();
  });
});
