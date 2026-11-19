import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query matches, kept up to date as the window changes. Where `matchMedia`
 * is missing (tests, very old browsers) it returns `fallback`.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia?.(query);
      mq?.addEventListener('change', onChange);
      return () => mq?.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(query).matches ?? fallback,
    () => fallback,
  );
}

/** Tailwind's `md` breakpoint: tablets and desktops. */
export const DESKTOP_QUERY = '(min-width: 768px)';
