import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reloadsSoFar, retryState, SERIES_MS, useAutoReload } from './auto-reload';

afterEach(() => {
  vi.useRealTimers();
  window.sessionStorage.clear();
});

describe('reloading a page that failed to load (D-092)', () => {
  it('waits 1 s quietly, then twice 2 s with the message, then gives up', () => {
    expect([0, 1, 2, 3].map(retryState)).toEqual(['waiting', 'retrying', 'retrying', 'failed']);
  });

  it('reloads after 1 second on the first failure, and counts it', () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    const { result } = renderHook(() => useAutoReload('failed', reload));
    expect(result.current).toBe('waiting');
    act(() => vi.advanceTimersByTime(999));
    expect(reload).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(reload).toHaveBeenCalledOnce();
    expect(reloadsSoFar()).toBe(1);
  });

  it('after a reload, says it is refreshing and reloads after 2 seconds', () => {
    vi.useFakeTimers();
    window.sessionStorage.setItem('myvocab.autoReload', JSON.stringify({ n: 2, at: Date.now() }));
    const reload = vi.fn();
    const { result } = renderHook(() => useAutoReload('failed', reload));
    expect(result.current).toBe('retrying');
    act(() => vi.advanceTimersByTime(2000));
    expect(reload).toHaveBeenCalledOnce();
    expect(reloadsSoFar()).toBe(3);
  });

  it('after three reloads, shows the error and stops', () => {
    vi.useFakeTimers();
    window.sessionStorage.setItem('myvocab.autoReload', JSON.stringify({ n: 3, at: Date.now() }));
    const reload = vi.fn();
    const { result } = renderHook(() => useAutoReload('failed', reload));
    expect(result.current).toBe('failed');
    act(() => vi.advanceTimersByTime(10_000));
    expect(reload).not.toHaveBeenCalled();
  });

  it('a successful load ends the series; an old series starts over', () => {
    window.sessionStorage.setItem('myvocab.autoReload', JSON.stringify({ n: 3, at: Date.now() }));
    renderHook(() => useAutoReload('ok', vi.fn()));
    expect(reloadsSoFar()).toBe(0);
    window.sessionStorage.setItem(
      'myvocab.autoReload',
      JSON.stringify({ n: 3, at: Date.now() - SERIES_MS - 1 }),
    );
    expect(reloadsSoFar()).toBe(0);
  });

  it('does nothing while loading', () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    const { result } = renderHook(() => useAutoReload('loading', reload));
    expect(result.current).toBeNull();
    act(() => vi.advanceTimersByTime(5000));
    expect(reload).not.toHaveBeenCalled();
  });
});
