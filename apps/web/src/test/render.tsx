import type { SessionUser } from '@myvocab/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { vi } from 'vitest';
import { ToastProvider } from '../components/Toast';
import { META } from './fixtures';

export const TEST_USER: SessionUser = {
  id: 'u1',
  name: 'Test Learner',
  email: 'learner@example.test',
  image: null,
  role: 'user',
  isOwner: false,
};

type Handler = (init: RequestInit | undefined, url: string) => Response | Promise<Response>;

/**
 * Mocks `fetch` for /api: `routes` maps "METHOD /path" (path without the query string) to a
 * handler. /api/me and /api/meta have defaults.
 */
export function mockFetch(
  routes: Record<string, Handler>,
  user: SessionUser | null | (() => SessionUser | null) = TEST_USER,
) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const key = `${init?.method ?? 'GET'} ${url.split('?')[0]}`;
    const handler = routes[key];
    if (handler) return handler(init, url);
    if (key === 'GET /api/me')
      return Response.json({ user: typeof user === 'function' ? user() : user });
    if (key === 'GET /api/meta') return Response.json(META);
    return Response.json({ error: { code: 'NOT_FOUND', message: key } }, { status: 404 });
  });
}

export function renderRoutes(
  routes: RouteObject[],
  initialEntries = ['/'],
  wrap?: (n: ReactNode) => ReactNode,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries });
  const tree = (
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  );
  render(<QueryClientProvider client={client}>{wrap ? wrap(tree) : tree}</QueryClientProvider>);
  return { router, client };
}
