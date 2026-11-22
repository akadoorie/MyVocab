import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeCard } from '../../test/fixtures';
import { CrumpleGhost } from './CrumpleGhost';

afterEach(() => vi.useRealTimers());

describe('CrumpleGhost', () => {
  it('is a hidden, test-id-free copy at the card position that removes itself', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const { container } = render(
      <CrumpleGhost
        crumple={{
          key: 1,
          card: makeCard(2),
          side: 'back',
          hintsShown: false,
          rect: { top: 100, left: 20, width: 300, height: 200 },
          dx: -120,
          dy: -90,
        }}
        onDone={onDone}
      />,
    );
    const ghost = container.firstElementChild as HTMLElement;
    expect(ghost).toHaveAttribute('aria-hidden', 'true');
    expect(ghost.style.top).toBe('100px');
    expect(ghost.style.getPropertyValue('--dx')).toBe('-120px');
    expect(container.querySelector('[data-testid]')).toBeNull();
    expect(container.querySelectorAll('.paper__facet').length).toBeGreaterThanOrEqual(8);
    act(() => vi.advanceTimersByTime(1000));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
