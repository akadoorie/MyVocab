import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Layout } from '../../routes/Layout';
import { mockFetch, renderRoutes, TEST_USER } from '../../test/render';
import { AccountPage } from './AccountPage';

afterEach(() => vi.restoreAllMocks());

function setup(routes: Parameters<typeof mockFetch>[0] = {}, initialPath = '/account') {
  // The session ends once the account is deleted or the user signs out.
  let signedIn = true;
  const end = (handler: Parameters<typeof mockFetch>[0][string] | undefined) =>
    handler &&
    ((init: RequestInit | undefined, url: string) => {
      signedIn = false;
      return handler(init, url);
    });
  const fetchSpy = mockFetch(
    {
      ...routes,
      ...(routes['DELETE /api/me'] ? { 'DELETE /api/me': end(routes['DELETE /api/me'])! } : {}),
      ...(routes['POST /api/auth/sign-out']
        ? { 'POST /api/auth/sign-out': end(routes['POST /api/auth/sign-out'])! }
        : {}),
    },
    () => (signedIn ? TEST_USER : null),
  );
  const { router } = renderRoutes(
    [
      {
        path: '/',
        element: <Layout />,
        children: [
          { index: true, element: <p>home page</p> },
          { path: 'account', element: <AccountPage /> },
          { path: 'known', element: <p>known page</p> },
        ],
      },
    ],
    [initialPath],
  );
  return { fetchSpy, router };
}

describe('AccountPage', () => {
  it('shows the profile and enables deletion only after typing DELETE', async () => {
    setup();
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeVisible();
    expect(screen.getAllByText('learner@example.test').length).toBeGreaterThan(0);
    const button = screen.getByRole('button', { name: 'Delete my account' });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), {
      target: { value: 'delete' },
    });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), {
      target: { value: 'DELETE' },
    });
    expect(button).toBeEnabled();
  });

  it('deletes the account and goes home signed out', async () => {
    const del = vi.fn((_init: RequestInit | undefined) => Response.json({ ok: true }));
    const { router } = setup({ 'DELETE /api/me': del });
    fireEvent.change(await screen.findByLabelText('Type DELETE to confirm'), {
      target: { value: 'DELETE' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(JSON.parse(String(del.mock.calls[0]![0]!.body))).toEqual({ confirm: 'DELETE' });
    expect(await screen.findByText('Your account was deleted.')).toBeVisible();
    // The header's button; the guest register notice may add a second one, depending on timing.
    expect(screen.getAllByRole('button', { name: 'Sign in with Google' })[0]).toBeVisible();
  });

  it('shows why the last admin cannot delete their account', async () => {
    setup({
      'DELETE /api/me': () =>
        Response.json(
          { error: { code: 'CONFLICT', message: 'You are the last admin.' } },
          { status: 409 },
        ),
    });
    fireEvent.change(await screen.findByLabelText('Type DELETE to confirm'), {
      target: { value: 'DELETE' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You are the last admin.');
  });
});

describe('header (FR-L70)', () => {
  it('shows the account menu with its links and closes it with Escape', async () => {
    setup({}, '/');
    const button = await screen.findByRole('button', { name: 'Account menu' });
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).toBeNull();
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('link', { name: 'My known words' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('signs out and returns home', async () => {
    const signOut = vi.fn(() => Response.json({ success: true }));
    const { router } = setup({ 'POST /api/auth/sign-out': signOut }, '/known');
    fireEvent.click(await screen.findByRole('button', { name: 'Account menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  });
});
