/**
 * A tab opened before a deploy still knows the old file names of the lazily loaded parts (e.g. the
 * admin area). After a deploy those files are gone, and the server answers with the app page, so
 * the import fails ("'text/html' is not a valid JavaScript MIME type"). Vite reports this as a
 * `vite:preloadError` event: we then reload the page once to pick up the new version.
 *
 * A guard in sessionStorage allows at most one automatic reload per GUARD_MS, so a part that is
 * really broken shows its error instead of reloading forever.
 */

const KEY = 'myvocab.staleReloadAt';
export const GUARD_MS = 15_000;

export function handleStaleBuild(
  event: Event,
  { now = Date.now(), reload = () => window.location.reload() } = {},
): boolean {
  let last = 0;
  try {
    last = Number(window.sessionStorage.getItem(KEY) ?? 0);
  } catch {
    // storage unavailable: still reload once
  }
  if (now - last < GUARD_MS) return false; // just reloaded: let the error show
  try {
    window.sessionStorage.setItem(KEY, String(now));
  } catch {
    // ignore
  }
  event.preventDefault(); // don't throw: the page is about to reload
  reload();
  return true;
}

export function installStaleBuildReload(): void {
  window.addEventListener('vite:preloadError', (e) => handleStaleBuild(e));
}
