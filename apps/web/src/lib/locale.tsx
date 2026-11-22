import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { activateLocale, activeLocale, isLocale, strings, type Locale } from '../strings';

/**
 * The UI language (D-080): Hebrew by default, English on request, remembered in this browser.
 * The admin area is always English and left-to-right.
 */
const STORAGE_KEY = 'myvocab.locale';
export const DEFAULT_LOCALE: Locale = 'he';

export function readSavedLocale(): Locale {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(saved) ? saved : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

function saveLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // storage unavailable: the choice lasts until the page is closed
  }
}

export const isAdminPath = (pathname: string) =>
  pathname === '/admin' || pathname.startsWith('/admin/');

/** The language for a page: the learner's choice, except English in the admin area. */
export const localeFor = (pathname: string, choice: Locale): Locale =>
  isAdminPath(pathname) ? 'en' : choice;

/** `<html lang dir>`, the description and the title follow the active strings. */
export function applyDocumentLocale(): void {
  const root = document.documentElement;
  root.lang = strings.locale.lang;
  root.dir = strings.locale.dir;
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute('content', strings.locale.metaDescription);
}

/** Before the first render (main.tsx): the right strings and direction, so nothing flips. */
export function initLocale(pathname: string): void {
  activateLocale(localeFor(pathname, readSavedLocale()));
  applyDocumentLocale();
}

type LocaleContextValue = { locale: Locale; setLocale: (locale: Locale) => void };

const LocaleContext = createContext<LocaleContextValue>({
  locale: activeLocale,
  setLocale: () => {},
});

/** The learner's chosen language and a way to change it (the footer switch). */
export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}

type PathSource = {
  subscribe: (listener: () => void) => () => void;
  state: { location: { pathname: string } };
};

/**
 * Holds the chosen language and re-mounts `children` when the active one changes (a switch, or
 * entering/leaving the admin area), so every component renders with the new `strings`.
 */
export function LocaleProvider({ router, children }: { router: PathSource; children: ReactNode }) {
  const [choice, setChoice] = useState<Locale>(readSavedLocale);
  const subscribe = useCallback(
    (onChange: () => void) => router.subscribe(() => onChange()),
    [router],
  );
  const pathname = useSyncExternalStore(subscribe, () => router.state.location.pathname);
  const effective = localeFor(pathname, choice);
  // Swapped during render, before the children read `strings` (idempotent).
  if (activeLocale !== effective) activateLocale(effective);

  useLayoutEffect(() => applyDocumentLocale(), [effective]);

  const setLocale = useCallback((locale: Locale) => {
    saveLocale(locale);
    setChoice(locale);
  }, []);
  const value = useMemo(() => ({ locale: choice, setLocale }), [choice, setLocale]);

  return (
    <LocaleContext.Provider value={value}>
      <Fragment key={effective}>{children}</Fragment>
    </LocaleContext.Provider>
  );
}
