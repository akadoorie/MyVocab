import { useEffect, useMemo, useState } from 'react';

/**
 * Returns `value` after it stopped changing for `delayMs` (FR-L7: 300 ms). Values are compared by
 * content (JSON), so passing a fresh object on every render doesn't restart the timer.
 */
export function useDebounced<T>(value: T, delayMs: number): T {
  const key = JSON.stringify(value) ?? 'null';
  const [debouncedKey, setDebouncedKey] = useState(key);
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedKey(key), delayMs);
    return () => window.clearTimeout(id);
  }, [key, delayMs]);
  return useMemo(() => JSON.parse(debouncedKey) as T, [debouncedKey]);
}
