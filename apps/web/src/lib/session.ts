/**
 * The signed-in user. M3: everyone is a guest; M4 replaces this with Better Auth (`GET /api/me`).
 */
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: 'user' | 'admin';
  isOwner: boolean;
};

export type SessionState = { user: SessionUser | null; isGuest: boolean; loading: boolean };

export function useSession(): SessionState {
  return { user: null, isGuest: true, loading: false };
}

/** Starts Google sign-in (wired to Better Auth in M4). */
export function startGoogleSignIn(): void {
  window.location.assign('/?signin=google');
}
