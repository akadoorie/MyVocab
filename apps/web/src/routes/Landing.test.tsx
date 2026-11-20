import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, renderRoutes } from '../test/render';
import { Landing } from './Landing';

afterEach(() => vi.restoreAllMocks());

const routes = [{ path: '/', Component: Landing }];

describe('Landing: back from a failed sign-in (FR-L56)', () => {
  it('a refused account sees a lasting, neutral notice; the address is cleaned', async () => {
    mockFetch({}, null);
    const { router } = renderRoutes(routes, ['/?signin=refused']);
    const notice = await screen.findByRole('alert');
    expect(notice).toHaveTextContent(
      'We couldn’t sign you in with this Google account. You can keep learning as a guest.',
    );
    expect(notice.textContent).not.toMatch(/ban/i);
    expect(router.state.location.search).toBe('');
    // The automatic guest toast is held back so it doesn't contradict the notice.
    await new Promise((r) => setTimeout(r, 50)); // after the address was cleaned
    expect(screen.queryByText(/Please register/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('any other failure asks to try again', async () => {
    mockFetch({}, null);
    renderRoutes(routes, ['/?signin=error']);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sign-in didn’t complete. Please try again.',
    );
  });

  it('shows nothing on a normal visit', async () => {
    mockFetch({}, null);
    renderRoutes(routes, ['/']);
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Landing: the Buttons guide under How it works (D-030)', () => {
  const guide = async () =>
    (await screen.findAllByRole('region', { name: 'Buttons' }))[0] as HTMLElement;

  it('explains the three answer buttons to a signed-in learner', async () => {
    mockFetch({});
    renderRoutes(routes, ['/']);
    const section = await guide();
    // The signed-in state loads first (until then the page shows the guest version).
    await waitFor(() =>
      expect(section).toHaveTextContent(
        'I know it: Don’t show it again. You can bring it back from My known words.',
      ),
    );
    expect(section).toHaveTextContent(
      'I know it: Done for this session; it shows up again in future sessions.',
    );
    expect(section).toHaveTextContent(
      'I don’t know: It comes back later in this session, until you know it.',
    );
    expect(section.querySelector('.is-locked')).toBeNull();
  });

  it('shows guests the green button locked, with "(Sign-in to enable)" (D-042)', async () => {
    mockFetch({}, null);
    renderRoutes(routes, ['/']);
    const section = await guide();
    expect(section).toHaveTextContent(
      'I know it: Don’t show it again. You can bring it back from My known words. (Sign-in to enable)',
    );
    expect(section).toHaveTextContent(
      'I know it: Done for this session; it shows up again in future sessions.',
    );
    expect(section).not.toHaveTextContent('sign-in to use');
    expect(section.querySelector('.mini-btn--know.is-locked')).not.toBeNull();
    expect(section.querySelectorAll('.mini-btn__lock')).toHaveLength(1);
    expect(section.querySelector('.mini-btn--again.is-locked')).toBeNull();
  });
});

describe('Landing: guest sign-in banner (FR-L9, D-033)', () => {
  it('shows guests the glowing banner whose first words start sign-in', async () => {
    mockFetch({}, null);
    renderRoutes(routes, ['/']);
    const link = await screen.findByRole('button', { name: 'Sign-in with Google' });
    const banner = link.closest('p');
    expect(banner).toHaveClass('sign-in-glow');
    expect(banner).toHaveTextContent(
      'Sign-in with Google to remember the words you know and choose bigger sessions.',
    );
  });
});

describe('Landing: registered users (D-036)', () => {
  it('shows "Registered users: N" under the slogan', async () => {
    mockFetch(
      { 'GET /api/stats/registered-users': () => Response.json({ registeredUsers: 1234 }) },
      null,
    );
    renderRoutes(routes, ['/']);
    const line = await screen.findByTestId('registered-users');
    expect(line).toHaveTextContent('Registered users: 1,234');
    expect(screen.getByText('1,234')).toHaveClass('text-hint'); // yellow, like the version
  });

  it('shows nothing when the count fails to load', async () => {
    mockFetch({}, null);
    renderRoutes(routes, ['/']);
    await screen.findByRole('heading', { level: 1 });
    await waitFor(() => expect(screen.queryByTestId('registered-users')).toBeNull());
  });
});
