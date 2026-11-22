import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { BackArrow, LogoMark } from '../components/Icons';
import { UserMenu } from '../components/UserMenu';
import { api } from '../lib/api';
import { useLocale } from '../lib/locale';
import { startGoogleSignIn, useSession } from '../lib/session';
import { strings, type Locale } from '../strings';

const version = import.meta.env.VITE_APP_VERSION;

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
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
        <div className="flex items-baseline gap-2">
          <Link
            to="/"
            className="flex items-center gap-2.5 self-center text-xl font-bold tracking-tight"
          >
            <LogoMark className="h-8 w-8" />
            <span>
              My<span className="text-accent">Vocab</span>
            </span>
          </Link>
          {onHome && version && (
            // The version, so a refresh shows at a glance whether a new one is live (D-032).
            <span className="text-xs text-hint" data-testid="app-version">
              <span className="sr-only">{strings.nav.version} </span>
              <span aria-hidden="true">v</span>
              {version}
            </span>
          )}
        </div>
        <nav className="flex items-center gap-3 text-sm">
          {!onHome && (
            // Every page other than the start page offers a way back to it.
            <Link
              to="/"
              className="flex min-h-11 items-center gap-1.5 rounded-[10px] px-3 text-muted hover:text-text"
            >
              <BackArrow /> {strings.nav.home}
            </Link>
          )}
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
                className="min-h-11 rounded-[10px] border border-border px-3 py-2 hover:border-accent"
              >
                {strings.nav.signIn}
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
        <LanguageSwitch />
      </footer>
    </div>
  );
}

/**
 * Switches the UI between Hebrew and English (D-080). It names the other language in that
 * language ("English" / "עברית"), so it can be read by those who need it.
 */
function LanguageSwitch() {
  const { setLocale } = useLocale();
  const next = strings.locale.switchLang as Locale;
  return (
    <button
      type="button"
      lang={next}
      onClick={() => setLocale(next)}
      className="ms-auto hover:text-text"
      data-testid="language-switch"
    >
      {strings.locale.switchLabel}
    </button>
  );
}
