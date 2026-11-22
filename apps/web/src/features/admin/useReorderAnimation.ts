import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';

/** "Reduce motion" (or unknown, e.g. tests): no animation. */
function motionAllowed(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches ?? false;
}

/**
 * Animates a reorder in a list (D-076): rows marked `data-id` slide from where they were to
 * where they are now, and the row that was moved glows briefly. Call `snapshot(movedId)` just
 * before changing the order; the animation runs when `orderKey` changes.
 */
export function useReorderAnimation(listRef: RefObject<HTMLElement | null>, orderKey: string) {
  const before = useRef<{ tops: Map<string, number>; moved: string } | null>(null);

  const rows = useCallback(
    () => [...(listRef.current?.querySelectorAll<HTMLElement>('[data-id]') ?? [])],
    [listRef],
  );

  const snapshot = useCallback(
    (movedId: string | number) => {
      before.current = {
        tops: new Map(rows().map((el) => [el.dataset.id!, el.getBoundingClientRect().top])),
        moved: String(movedId),
      };
    },
    [rows],
  );

  useLayoutEffect(() => {
    const prev = before.current;
    before.current = null;
    if (!prev || !motionAllowed()) return;
    for (const el of rows()) {
      const id = el.dataset.id!;
      const was = prev.tops.get(id);
      if (was === undefined) continue;
      const dy = was - el.getBoundingClientRect().top;
      if (dy !== 0) {
        el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], {
          duration: 320,
          easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        });
      }
      if (id === prev.moved) {
        el.animate(
          [
            { boxShadow: '0 0 0 2px var(--accent), 0 0 22px var(--accent-glow)' },
            { boxShadow: '0 0 0 2px var(--accent), 0 0 22px var(--accent-glow)', offset: 0.4 },
            { boxShadow: '0 0 0 0 transparent' },
          ],
          { duration: 900, easing: 'ease-out' },
        );
      }
    }
  }, [orderKey, rows]);

  return snapshot;
}
