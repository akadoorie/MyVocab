import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GUARD_MS, handleStaleBuild } from './stale-build';

const failedLoad = () => new Event('vite:preloadError', { cancelable: true });

beforeEach(() => window.sessionStorage.clear());

describe('reload after a deploy (stale build)', () => {
  it('reloads once and keeps the error from being thrown', () => {
    const reload = vi.fn();
    const event = failedLoad();
    expect(handleStaleBuild(event, { now: 1_000_000, reload })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not reload again right after a reload, so a real error shows instead of a practice', () => {
    const reload = vi.fn();
    handleStaleBuild(failedLoad(), { now: 1_000_000, reload });
    const again = failedLoad();
    expect(handleStaleBuild(again, { now: 1_000_000 + 2_000, reload })).toBe(false);
    expect(again.defaultPrevented).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    // Much later (e.g. after the next deploy) it may reload again.
    expect(handleStaleBuild(failedLoad(), { now: 1_000_000 + GUARD_MS + 1, reload })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
