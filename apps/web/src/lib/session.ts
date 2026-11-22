import type { SessionUser } from '@myvocab/contracts';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export type { SessionUser };

export type SessionState = { user: SessionUser | null; isGuest: boolean; loading: boolean };

export const ME_QUERY_KEY = ['me'] as const;

/** The signed-in user from `GET /api/me` (PRD §12.2). A failed lookup counts as a guest. */
export function useSession(): SessionState {
  const me = useQuery({ queryKey: ME_QUERY_KEY, queryFn: api.me, staleTime: 5 * 60_000 });
  const user = me.data?.user ?? null;
  return { user, isGuest: user === null, loading: me.isPending };
}

/** Where to come back after signing in: the current page, except the practice screen. */
function returnPath(): string {
  const { pathname } = window.location;
  return pathname.startsWith('/practice') ? '/' : pathname;
}

/** Starts Google sign-in through Better Auth (PRD §13.1): the server answers with Google's URL. */
export function startGoogleSignIn(): void {
  api
    .signInSocial({
      provider: 'google',
      callbackURL: returnPath(),
      errorCallbackURL: '/?signin=error',
    })
    .then((res) => window.location.assign(res.url))
    .catch(() => window.location.assign('/?signin=error'));
}
