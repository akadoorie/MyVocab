import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { KnownQueue } from './known-queue';

const KnownQueueContext = createContext<KnownQueue | null>(null);

/** The signed-in learner's Know queue (PRD §6.4); null for guests (FR-L55). */
export function useKnownQueue(): KnownQueue | null {
  return useContext(KnownQueueContext);
}

export function KnownQueueProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();

  const queue = useMemo(
    () =>
      userId === null
        ? null
        : new KnownQueue({
            userId,
            transport: {
              send: (items, keepalive) => api.markKnown(items, keepalive),
              remove: (itemId) => api.unmarkKnown(itemId),
            },
            onSent: () => {
              void queryClient.invalidateQueries({ queryKey: ['available'] });
              void queryClient.invalidateQueries({ queryKey: ['known'] });
            },
          }),
    [userId, queryClient],
  );

  useEffect(() => {
    if (!queue) return;
    queue.start();
    // FR-L51: when the page is hidden or closed, send everything (pending included).
    const flushAll = () => void queue.flush({ all: true, keepalive: true });
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushAll();
    };
    window.addEventListener('pagehide', flushAll);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flushAll);
      document.removeEventListener('visibilitychange', onVisibility);
      queue.stop();
    };
  }, [queue]);

  return <KnownQueueContext.Provider value={queue}>{children}</KnownQueueContext.Provider>;
}
