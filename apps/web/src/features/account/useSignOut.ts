import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { ME_QUERY_KEY } from '../../lib/session';
import { useKnownQueue } from '../known/KnownQueueProvider';

/** Signs out after sending any queued Know marks (they would otherwise wait for the next sign-in). */
export function useSignOut(): () => Promise<void> {
  const queue = useKnownQueue();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useCallback(async () => {
    await queue?.flush({ all: true });
    try {
      await api.signOut();
    } finally {
      queryClient.setQueryData(ME_QUERY_KEY, { user: null });
      queryClient.removeQueries({ queryKey: ['known'] });
      void queryClient.invalidateQueries({ queryKey: ['available'] });
      navigate('/');
    }
  }, [queue, queryClient, navigate]);
}
