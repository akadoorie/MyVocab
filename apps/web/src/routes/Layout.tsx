import { useQuery } from '@tanstack/react-query';
import { Link, Outlet } from 'react-router';
import { api } from '../lib/api';
import { startGoogleSignIn, useSession } from '../lib/session';
import { strings } from '../strings';

/** Header, maintenance banner and footer around the regular pages (PRD §9.7). */
export function Layout() {
  const session = useSession();
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta, staleTime: 60_000 });
  const maintenance = meta.data?.maintenance;

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:rounded focus:bg-surface focus:p-2"
      >
        {strings.nav.skipToContent}
      </a>
      {maintenance?.enabled && (
        <div role="status" className="bg-hint px-4 py-2 text-center text-sm text-[var(--on-color)]">
          {maintenance.message || 'MyVocab is under maintenance.'}
        </div>
      )}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
        <Link to="/" className="text-xl font-semibold tracking-tight">
          My<span className="text-accent">Vocab</span>
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          {session.isGuest && (
            <button
              type="button"
              onClick={startGoogleSignIn}
              className="rounded-[10px] border border-border px-3 py-2 hover:border-accent"
            >
              {strings.nav.signIn}
            </button>
          )}
        </nav>
      </header>
      <Outlet />
      <footer className="mx-auto mt-auto flex w-full max-w-6xl gap-4 px-4 py-6 text-sm text-muted">
        <Link to="/privacy" className="hover:text-text">
          {strings.nav.privacy}
        </Link>
      </footer>
    </div>
  );
}
