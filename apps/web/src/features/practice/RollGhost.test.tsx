import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeCard } from '../../test/fixtures';
import { ROLL_MS, RollGhost } from './RollGhost';

afterEach(() => vi.useRealTimers());

describe('RollGhost', () => {
  it('is a hidden, test-id-free copy at the card position that rolls up and removes itself', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const { container } = render(
      <RollGhost
        roll={{
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
    expect(ghost.style.getPropertyValue('--h')).toBe('200px');
    expect(ghost.style.getPropertyValue('--dx')).toBe('-120px');
    expect(container.querySelector('[data-testid]')).toBeNull();
    expect(container.querySelector('.roll-ghost__sheet')).not.toBeNull();
    expect(container.querySelector('.roll-ghost__tube')).not.toBeNull();
    act(() => vi.advanceTimersByTime(ROLL_MS + 100));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
