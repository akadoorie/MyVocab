import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KnownQueue, queueStorageKey, type KnownTransport } from './known-queue';

const UNDO = 4000;
const mark = (itemId: number, round = 1) => ({ itemId, target: 'he', round });

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

function transport(): KnownTransport & {
  send: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
} {
  return {
    send: vi.fn(async () => ({ saved: 1 })),
    remove: vi.fn(async () => ({ removed: 1 })),
  };
}

function apiError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

let storage: ReturnType<typeof memoryStorage>;
let t: ReturnType<typeof transport>;
let onSent: ReturnType<typeof vi.fn<() => void>>;
let queue: KnownQueue;

beforeEach(() => {
  vi.useFakeTimers();
  storage = memoryStorage();
  t = transport();
  onSent = vi.fn<() => void>();
  queue = new KnownQueue({ userId: 'u1', transport: t, storage, onSent });
  queue.start();
});

afterEach(() => {
  queue.stop();
  vi.useRealTimers();
});

const sentItems = () =>
  t.send.mock.calls.map((c) => (c[0] as { itemId: number }[]).map((m) => m.itemId));

describe('KnownQueue', () => {
  it('sends a mark once its undo window ended, after the debounce, in one batch', async () => {
    queue.add(mark(1), UNDO);
    queue.add(mark(2), UNDO); // finalizes 1
    await vi.advanceTimersByTimeAsync(1999);
    expect(t.send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(sentItems()).toEqual([[1]]); // 2 is still in its undo window
    expect(onSent).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(UNDO + 2000);
    expect(sentItems()).toEqual([[1], [2]]);
    expect(queue.pending()).toEqual([]);
    expect(storage.data.size).toBe(0);
  });

  it('undo before sending removes the mark without calling the server', async () => {
    queue.add(mark(1), UNDO);
    queue.undo(1, 'he');
    await vi.advanceTimersByTimeAsync(UNDO + 5000);
    expect(t.send).not.toHaveBeenCalled();
    expect(t.remove).not.toHaveBeenCalled();
  });

  it('undo after the mark reached the server deletes it there', async () => {
    queue.add(mark(1), UNDO);
    await queue.flush({ all: true, keepalive: true }); // e.g. the tab was hidden
    expect(t.send).toHaveBeenCalledWith([mark(1)], true);
    queue.undo(1, 'he');
    await vi.advanceTimersByTimeAsync(0);
    expect(t.remove).toHaveBeenCalledWith(1, 'he');
  });

  it('undo while the mark is in flight deletes it after the send settles', async () => {
    let release!: () => void;
    t.send.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
    queue.add(mark(1), UNDO);
    const flushing = queue.flush({ all: true });
    queue.undo(1, 'he');
    expect(t.remove).not.toHaveBeenCalled();
    release();
    await flushing;
    await vi.advanceTimersByTimeAsync(0);
    expect(t.remove).toHaveBeenCalledWith(1, 'he');
  });

  it('undo of a mark another tab already sent still deletes it on the server', async () => {
    queue.add(mark(1), UNDO);
    storage.data.delete(queueStorageKey('u1')); // the other tab sent and removed it
    queue.undo(1, 'he');
    await vi.advanceTimersByTimeAsync(0);
    expect(t.remove).toHaveBeenCalledWith(1, 'he');
  });

  it('keeps unsent marks in storage (ids only) and sends them on the next start', async () => {
    queue.add(mark(7, 2), UNDO);
    const raw = storage.data.get(queueStorageKey('u1'))!;
    expect(raw).not.toMatch(/sample|text/);
    queue.stop(); // the tab closed before anything was sent

    const next = new KnownQueue({ userId: 'u1', transport: t, storage });
    next.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.send).toHaveBeenCalledWith([mark(7, 2)], false);
    next.stop();
  });

  it('keeps two directions of the same item apart (D-028)', async () => {
    queue.add({ itemId: 1, target: 'he', round: 1 }, UNDO);
    queue.add({ itemId: 1, target: 'ar', round: 1 }, UNDO); // finalizes the Hebrew mark
    expect(queue.pending()).toEqual([
      { itemId: 1, target: 'he', round: 1 },
      { itemId: 1, target: 'ar', round: 1 },
    ]);
    queue.undo(1, 'ar'); // undoes only the Arabic mark
    expect(queue.pending()).toEqual([{ itemId: 1, target: 'he', round: 1 }]);
    await vi.advanceTimersByTimeAsync(UNDO + 2000);
    expect(t.send.mock.calls.map((c) => c[0])).toEqual([[{ itemId: 1, target: 'he', round: 1 }]]);
    expect(t.remove).not.toHaveBeenCalled();

    // Undo of the sent Hebrew mark asks the server to delete that direction only.
    queue.undo(1, 'he');
    await vi.advanceTimersByTimeAsync(0);
    expect(t.remove).toHaveBeenCalledWith(1, 'he');
  });

  it('keeps each user’s queue separate', () => {
    queue.add(mark(1), UNDO);
    const other = new KnownQueue({ userId: 'u2', transport: t, storage });
    expect(other.pending()).toEqual([]);
    expect(queue.pending()).toEqual([mark(1)]);
  });

  it('retries failed sends with exponential backoff', async () => {
    t.send
      .mockRejectedValueOnce(new TypeError('network'))
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValue({ saved: 1 });
    queue.add(mark(1), UNDO);
    queue.finalizeAll();
    await vi.advanceTimersByTimeAsync(2000); // first attempt fails
    expect(t.send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000); // retry after 2 s fails
    expect(t.send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3999);
    expect(t.send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1); // retry after 4 s succeeds
    expect(t.send).toHaveBeenCalledTimes(3);
    expect(queue.pending()).toEqual([]);
  });

  it('pauses on 401 and keeps the marks for the next sign-in', async () => {
    t.send.mockRejectedValue(apiError(401));
    queue.add(mark(1), UNDO);
    queue.finalizeAll();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(queue.pending()).toEqual([mark(1)]);
  });

  it('drops a batch the server rejects as invalid (400) instead of retrying forever', async () => {
    t.send.mockRejectedValue(apiError(400));
    queue.add(mark(1), UNDO);
    queue.finalizeAll();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(queue.pending()).toEqual([]);
  });

  it('ignores invalid marks', () => {
    queue.add({ itemId: 1, target: '', round: 1 }, UNDO);
    queue.add({ itemId: 0, target: 'he', round: 1 }, UNDO);
    expect(queue.pending()).toEqual([]);
  });

  it('sends at most 100 marks per request', async () => {
    for (let i = 1; i <= 150; i++) queue.add(mark(i), UNDO);
    await queue.flush({ all: true });
    expect(t.send.mock.calls.map((c) => (c[0] as unknown[]).length)).toEqual([100, 50]);
  });

  it('works without storage (private mode)', async () => {
    const q = new KnownQueue({ userId: 'u3', transport: t, storage: null });
    q.start();
    q.add(mark(1), UNDO);
    await q.flush({ all: true });
    expect(t.send).toHaveBeenCalledWith([mark(1)], false);
    q.stop();
  });
});
