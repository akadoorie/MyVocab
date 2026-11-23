import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeCard } from '../../test/fixtures';
import { FIREWORK_MS, FireworkGhost } from './FireworkGhost';

afterEach(() => vi.useRealTimers());

describe('FireworkGhost (D-103)', () => {
  it('is a hidden, test-id-free copy at the card position, with a sky, that removes itself', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const { container } = render(
      <FireworkGhost
        roll={{
          key: 1,
          card: makeCard(3),
          side: 'front',
          hintsShown: false,
          kind: 'firework',
          rect: { top: 100, left: 20, width: 300, height: 200 },
          dx: -120,
          dy: -90,
        }}
        onDone={onDone}
      />,
    );
    const ghost = container.firstElementChild as HTMLElement;
    expect(ghost).toHaveAttribute('aria-hidden', 'true');
    expect(ghost.querySelector('.firework-ghost__card')).toHaveStyle({
      top: '100px',
      left: '20px',
    });
    expect(ghost.querySelector('canvas.firework-ghost__sky')).not.toBeNull();
    expect(container.querySelector('[data-testid]')).toBeNull();
    act(() => vi.advanceTimersByTime(FIREWORK_MS + 100));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
