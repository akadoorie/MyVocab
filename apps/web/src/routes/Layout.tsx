import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { AppVersion } from '../components/AppVersion';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { HomeIcon, LogoMark } from '../components/Icons';
import { UserMenu } from '../components/UserMenu';
import { api } from '../lib/api';
import { startGoogleSignIn, useSession } from '../lib/session';
import { strings } from '../strings';

/** Header, maintenance banner and footer around the regular pages (PRD §9.7). */
export function Layout() {
  const session = useSession();
  const onHome = useLocation().pathname === '/';
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
        <div role="status" className="bg-hint px-4 py-2 text-center text-sm text-[#1c1407]">
          {maintenance.message || strings.nav.maintenance}
        </div>
      )}
      {/* On Home the language switch and sign-in sit on the right in every language, Hebrew too
          (D-123): mirrored back on right-to-left pages. */}
      <header
        className={`mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 ${onHome ? 'rtl:flex-row-reverse' : ''}`}
      >
        <div className="flex items-baseline gap-2">
          <Link
            to="/"
            // On Home, a little smaller on the smallest phones, to fit the language switch (D-083).
            className={`flex items-center gap-2.5 self-center font-bold tracking-tight ${onHome ? 'text-lg min-[360px]:text-xl' : 'text-xl'}`}
          >
            <LogoMark className={onHome ? 'h-7 w-7 min-[360px]:h-8 min-[360px]:w-8' : 'h-8 w-8'} />
            <span>
              My<span className="text-accent">Vocab</span>
            </span>
          </Link>
          {onHome && <AppVersion />}
        </div>
        <nav
          className={`flex items-center text-sm ${onHome ? 'gap-2 rtl:flex-row-reverse sm:gap-3' : 'gap-3'}`}
        >
          {!onHome && (
            // Every page other than the start page offers a way back to it: a house (D-086).
            <Link
              to="/"
              aria-label={strings.nav.home}
              title={strings.nav.home}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-[10px] text-muted hover:text-text"
            >
              <HomeIcon />
            </Link>
          )}
          {onHome && <LanguageSwitch />}
          {session.user ? (
            <>
              {session.user.role === 'admin' && (
                // Full-page navigation so Cloudflare Access can intercept it (PRD §13.4).
                <a
                  href="/admin"
                  className="hidden min-h-11 items-center rounded-[10px] px-3 text-muted hover:text-text sm:flex"
                >
                  {strings.nav.admin}
                </a>
              )}
              <NavLink
                to="/known"
                className={({ isActive }) =>
                  `hidden min-h-11 items-center rounded-[10px] px-3 hover:text-text sm:flex ${isActive ? 'text-text' : 'text-muted'}`
                }
              >
                {strings.nav.knownWords}
              </NavLink>
              <UserMenu user={session.user} />
            </>
          ) : (
            !session.loading && (
              <button
                type="button"
                onClick={startGoogleSignIn}
                aria-label={strings.nav.signIn}
                className="min-h-11 rounded-[10px] border border-border px-3 py-2 hover:border-accent"
              >
                {onHome ? (
                  // Shorter on phones, to leave room for the language switch (D-083).
                  <>
                    <span className="sm:hidden">{strings.nav.signInShort}</span>
                    <span className="hidden sm:inline">{strings.nav.signIn}</span>
                  </>
                ) : (
                  strings.nav.signIn
                )}
              </button>
            )
          )}
        </nav>
      </header>
      <Outlet />
      <footer className="mx-auto mt-auto flex w-full max-w-6xl gap-4 px-4 py-6 text-sm text-muted">
        <Link to="/privacy" className="hover:text-text">
          {strings.nav.privacy}
        </Link>
        {/* A plain file served with the site, not an app page, so a full link in a new tab (D-099). */}
        <a
          href="/third-party-licenses.txt"
          target="_blank"
          rel="noopener"
          className="hover:text-text"
        >
          {strings.nav.licenses}
        </a>
      </footer>
    </div>
  );
}
