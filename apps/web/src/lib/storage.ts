/**
 * Safe Web Storage access: storage can be unavailable (private mode, blocked site data), so every
 * read and write is wrapped and the app works without it.
 */
type Area = 'session' | 'local';

function store(area: Area): Storage | null {
  try {
    return area === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

export function readJson<T>(area: Area, key: string, validate: (v: unknown) => v is T): T | null {
  try {
    const raw = store(area)?.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return validate(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeJson(area: Area, key: string, value: unknown): void {
  try {
    store(area)?.setItem(key, JSON.stringify(value));
  } catch {
    // ignore: storage full or unavailable
  }
}

export function removeKey(area: Area, key: string): void {
  try {
    store(area)?.removeItem(key);
  } catch {
    // ignore
  }
}

export function readFlag(area: Area, key: string): boolean {
  try {
    return store(area)?.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function writeFlag(area: Area, key: string): void {
  try {
    store(area)?.setItem(key, '1');
  } catch {
    // ignore
  }
}
