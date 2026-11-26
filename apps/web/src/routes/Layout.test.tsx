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

  // On Home the avatar sits at the right in every language (D-123), so the menu anchors to the
  // physical right; elsewhere it follows the reading direction (logical end).
  it.each([
    ['/', 'right-0', 'end-0'],
    ['/known', 'end-0', 'right-0'],
  ])('anchors the account menu on %s with %s', async (path, anchor, other) => {
    mockFetch({});
    renderRoutes(routes, [path]);
    const button = await screen.findByRole('button', { name: 'Account menu' });
    fireEvent.click(button);
    const panel = document.getElementById(button.getAttribute('aria-controls')!)!;
    expect(panel).toHaveClass(anchor);
    expect(panel).not.toHaveClass(other);
  });
});
