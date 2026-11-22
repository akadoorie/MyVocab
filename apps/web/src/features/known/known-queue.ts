import { KNOWN_BATCH_MAX, knownMarkSchema, type KnownMarkInput } from '@myvocab/contracts';

/**
 * The client-side queue of Know marks (PRD §6.4, FR-L50–53).
 *
 * - A mark is **pending** during its undo window and becomes **final** when the window ends or a
 *   newer Know happens. Final marks are sent in batches (debounced ~2 s).
 * - `flush({ all: true, keepalive: true })` sends everything, pending included, when the page is
 *   hidden or closed.
 * - The queue lives in localStorage, keyed by user id, holding item ids, target codes and round
 *   numbers only (never item text), so unsent marks survive a closed tab.
 * - Failed sends retry with exponential backoff. The server upsert is idempotent, so sending a
 *   mark twice is harmless; entries leave the queue only after the server confirmed them.
 * - Undo removes the mark from the queue; if it may already have reached the server (sent by this
 *   tab, in flight, or sent by another tab), the queue also asks the server to delete it.
 * - A mark is an item in one direction (D-028): the item id and target language together are the
 *   key, so marking the same item in another direction never replaces or undoes the first.
 */

type Entry = {
  /** item id */ i: number;
  /** target language */ t: string;
  /** round */ c: number;
  /** 1 = final, 0 = pending (still undoable) */ f: 0 | 1;
  /** unique per entry, so a confirmed send never removes a newer mark of the same item */ n: number;
};

/** An item in one direction (D-028). */
const keyOf = (itemId: number, target: string) => `${itemId}:${target}`;
const entryKey = (e: Entry) => keyOf(e.i, e.t);

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type SendFailure = 'unauthorized' | 'rejected' | 'retry';

export type KnownTransport = {
  send(items: KnownMarkInput[], keepalive: boolean): Promise<unknown>;
  remove(itemId: number, target: string): Promise<unknown>;
};

export type KnownQueueOptions = {
  userId: string;
  transport: KnownTransport;
  storage?: KeyValueStorage | null;
  debounceMs?: number;
  maxBackoffMs?: number;
  /** Called after the server confirmed a batch (e.g. to refresh counts). */
  onSent?: () => void;
};

export const queueStorageKey = (userId: string) => `myvocab.knownQueue.v1.${userId}`;

export function classifyFailure(error: unknown): SendFailure {
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 401) return 'unauthorized';
  if (status === 400) return 'rejected';
  return 'retry';
}

function isEntry(v: unknown): v is Entry {
  const e = v as Entry;
  return (
    typeof e === 'object' &&
    e !== null &&
    Number.isInteger(e.i) &&
    typeof e.t === 'string' &&
    Number.isInteger(e.c) &&
    (e.f === 0 || e.f === 1) &&
    typeof e.n === 'number'
  );
}

const toMark = (e: Entry): KnownMarkInput => ({ itemId: e.i, target: e.t, round: e.c });

let counter = 0;
const nextNonce = () => Date.now() * 1000 + (counter++ % 1000);

export class KnownQueue {
  private readonly key: string;
  private storage: KeyValueStorage | null;
  private memory: Entry[] = [];
  private readonly undoTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private regularSend: Promise<void> | null = null;
  private readonly inFlight = new Map<Promise<void>, Set<string>>();
  private readonly sent = new Set<string>();
  private backoff = 0;
  private paused = false;
  private stopped = false;
  private readonly debounceMs: number;
  private readonly maxBackoffMs: number;

  constructor(private readonly opts: KnownQueueOptions) {
    this.key = queueStorageKey(opts.userId);
    this.storage = opts.storage === undefined ? defaultStorage() : opts.storage;
    this.debounceMs = opts.debounceMs ?? 2000;
    this.maxBackoffMs = opts.maxBackoffMs ?? 60_000;
  }

  /** Entries waiting to be confirmed by the server (for tests and diagnostics). */
  pending(): KnownMarkInput[] {
    return this.read().map(toMark);
  }

  /** On app load / sign-in: marks left by an earlier page are final; send them. */
  start(): void {
    this.paused = false;
    this.stopped = false;
    const entries = this.read();
    if (entries.length === 0) return;
    this.write(entries.map((e) => ({ ...e, f: 1 })));
    this.schedule(0);
  }

  /** A Know (FR-L50). Earlier pending marks become final (FR-L51). */
  add(mark: KnownMarkInput, undoWindowMs: number): void {
    if (this.stopped || !knownMarkSchema.safeParse(mark).success) return;
    for (const timer of this.undoTimers.values()) clearTimeout(timer);
    this.undoTimers.clear();
    const key = keyOf(mark.itemId, mark.target);
    const entries: Entry[] = this.read()
      .filter((e) => entryKey(e) !== key)
      .map((e) => ({ ...e, f: 1 }));
    entries.push({ i: mark.itemId, t: mark.target, c: mark.round, f: 0, n: nextNonce() });
    this.write(entries);
    this.sent.delete(key);
    this.undoTimers.set(
      key,
      setTimeout(() => this.finalize(key), undoWindowMs),
    );
    if (entries.some((e) => e.f === 1)) this.schedule(this.debounceMs);
  }

  /** Undo of a Know in one direction (FR-L53, D-028). */
  undo(itemId: number, target: string): void {
    const key = keyOf(itemId, target);
    const timer = this.undoTimers.get(key);
    if (timer !== undefined) clearTimeout(timer);
    this.undoTimers.delete(key);
    const entries = this.read();
    const queued = entries.some((e) => entryKey(e) === key);
    if (queued) this.write(entries.filter((e) => entryKey(e) !== key));
    const inFlight = [...this.inFlight].filter(([, keys]) => keys.has(key)).map(([p]) => p);
    if (queued && inFlight.length === 0 && !this.sent.has(key)) return;
    // It may be on the server already: delete it there once any send carrying it has settled.
    this.sent.delete(key);
    void Promise.allSettled(inFlight).then(() => this.removeWithRetry(itemId, target, 0));
  }

  /** All pending marks become final (e.g. when the practice screen closes: Undo is gone). */
  finalizeAll(): void {
    for (const timer of this.undoTimers.values()) clearTimeout(timer);
    this.undoTimers.clear();
    const entries = this.read();
    if (entries.some((e) => e.f === 0)) {
      this.write(entries.map((e) => ({ ...e, f: 1 })));
      this.schedule(this.debounceMs);
    }
  }

  /**
   * Sends queued marks now. `all` includes pending ones; `keepalive` lets the request outlive the
   * page (pagehide / tab hidden).
   */
  async flush(options: { all?: boolean; keepalive?: boolean } = {}): Promise<void> {
    if (this.stopped) return;
    const { all = false, keepalive = false } = options;
    if (!all && !keepalive && this.regularSend) return this.regularSend;
    const entries = this.read().filter((e) => all || e.f === 1);
    if (entries.length === 0) return;
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    const batches: Entry[][] = [];
    for (let i = 0; i < entries.length; i += KNOWN_BATCH_MAX) {
      batches.push(entries.slice(i, i + KNOWN_BATCH_MAX));
    }
    const run = Promise.all(batches.map((b) => this.send(b, keepalive))).then(() => undefined);
    if (!keepalive) {
      this.regularSend = run.finally(() => {
        this.regularSend = null;
      });
    }
    return run;
  }

  /** Stops timers. Unsent marks stay in storage for the next start(). */
  stop(): void {
    this.stopped = true;
    for (const timer of this.undoTimers.values()) clearTimeout(timer);
    this.undoTimers.clear();
    if (this.flushTimer !== null) clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }

  // -------------------------------------------------------------------------------------------

  private finalize(key: string): void {
    this.undoTimers.delete(key);
    const entries = this.read();
    if (!entries.some((e) => entryKey(e) === key && e.f === 0)) return;
    this.write(entries.map((e) => (entryKey(e) === key ? { ...e, f: 1 } : e)));
    this.schedule(this.debounceMs);
  }

  private schedule(delayMs: number): void {
    if (this.paused || this.stopped || this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, delayMs);
  }

  private send(batch: Entry[], keepalive: boolean): Promise<void> {
    const keys = new Set(batch.map(entryKey));
    const promise = (async () => {
      try {
        await this.opts.transport.send(batch.map(toMark), keepalive);
        const confirmed = new Set(batch.map((e) => e.n));
        this.write(this.read().filter((e) => !confirmed.has(e.n)));
        for (const key of keys) this.sent.add(key);
        this.backoff = 0;
        this.opts.onSent?.();
        if (this.read().some((e) => e.f === 1)) this.schedule(0);
      } catch (error) {
        const failure = classifyFailure(error);
        if (failure === 'unauthorized') {
          // Signed out or session expired: keep the marks for the next sign-in.
          this.paused = true;
        } else if (failure === 'rejected') {
          // The server refused this batch as invalid: retrying would never succeed.
          const dropped = new Set(batch.map((e) => e.n));
          this.write(this.read().filter((e) => !dropped.has(e.n)));
        } else if (!keepalive) {
          this.backoff = Math.min(
            this.backoff ? this.backoff * 2 : this.debounceMs,
            this.maxBackoffMs,
          );
          this.schedule(this.backoff);
        }
      }
    })();
    this.inFlight.set(promise, keys);
    void promise.finally(() => this.inFlight.delete(promise));
    return promise;
  }

  private async removeWithRetry(itemId: number, target: string, attempt: number): Promise<void> {
    if (this.stopped) return;
    try {
      await this.opts.transport.remove(itemId, target);
    } catch (error) {
      if (classifyFailure(error) !== 'retry' || attempt >= 5) return;
      const delay = Math.min(this.debounceMs * 2 ** attempt, this.maxBackoffMs);
      setTimeout(() => void this.removeWithRetry(itemId, target, attempt + 1), delay);
    }
  }

  private read(): Entry[] {
    if (!this.storage) return this.memory;
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
    } catch {
      return this.memory;
    }
  }

  private write(entries: Entry[]): void {
    this.memory = entries;
    if (!this.storage) return;
    try {
      if (entries.length === 0) this.storage.removeItem(this.key);
      else this.storage.setItem(this.key, JSON.stringify(entries));
    } catch {
      // Storage full or blocked: keep the queue in memory for this page.
      this.storage = null;
    }
  }
}

function defaultStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
