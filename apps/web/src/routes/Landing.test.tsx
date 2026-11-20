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

  it('shows guests the orange button greyed out, and "Done for this session" for green', async () => {
    mockFetch({}, null);
    renderRoutes(routes, ['/']);
    const section = await guide();
    expect(section).toHaveTextContent('I know it: Done for this session.');
    expect(section).toHaveTextContent('(sign in to use)');
    expect(section.querySelector('.mini-btn--again.is-locked')).not.toBeNull();
  });
});
