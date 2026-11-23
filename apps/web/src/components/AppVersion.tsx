import { strings } from '../strings';

const version = import.meta.env.VITE_APP_VERSION;

/**
 * The app version ("v1.131"), so a refresh shows at a glance whether a new one is live (D-032): on
 * the Home page next to the logo, and in a practice next to Home (D-093). Nothing without a version.
 */
/** `className` sets the size and placement (default: small text in the flow). */
export function AppVersion({ className = 'text-xs' }: { className?: string }) {
  if (!version) return null;
  return (
    <span className={`text-hint ${className}`} data-testid="app-version">
      <span className="sr-only">{strings.nav.version} </span>
      <span aria-hidden="true">v</span>
      {version}
    </span>
  );
}
