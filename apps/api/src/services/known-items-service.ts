import {
  KNOWN_PAGE_SIZE,
  type KnownFilter,
  type KnownItem,
  type KnownListResponse,
  type KnownMarkInput,
  type KnownSort,
  type RestoreKnownRequest,
} from '@myvocab/contracts';
import { strategyFor, type TextDir } from '@myvocab/core';
import { z } from 'zod';
import { ValidationError } from '../middleware/errors';
import type {
  KnownCursor,
  KnownListRow,
  KnownRepository,
  LanguageRepository,
} from '../repositories/interfaces';

/**
 * Known items of a signed-in learner (PRD §6.4–6.5). `userId` always comes from the session,
 * never from the request (PRD §12.3).
 */

export type KnownListInput = KnownFilter & { sort: KnownSort; cursor?: string | undefined };

const cursorSchema = z.tuple([
  z.union([z.number().int(), z.string().max(400)]),
  z.number().int(),
  z.string().max(20),
]);

function toBase64Url(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)));
}

export function encodeCursor(sort: KnownSort, row: KnownListRow): string {
  const key = sort === 'az' ? row.normalizedText : row.knownAt;
  return toBase64Url(JSON.stringify([key, row.itemId, row.knownTarget]));
}

export function decodeCursor(sort: KnownSort, cursor: string): KnownCursor {
  try {
    const [key, itemId, target] = cursorSchema.parse(JSON.parse(fromBase64Url(cursor)));
    if ((sort === 'az') !== (typeof key === 'string')) throw new Error('cursor/sort mismatch');
    return { key, itemId, target };
  } catch {
    throw new ValidationError('Invalid cursor');
  }
}

export class KnownItemsService {
  constructor(
    private readonly deps: {
      known: KnownRepository;
      languages: LanguageRepository;
      now?: () => number;
    },
  ) {}

  /** FR-L51/52: idempotent batch upsert, one mark per item + direction (D-028). */
  async mark(userId: string, marks: readonly KnownMarkInput[]): Promise<number> {
    const unique = new Map<string, KnownMarkInput>();
    for (const m of marks) {
      const key = `${m.itemId}:${m.target}`;
      if (!unique.has(key)) unique.set(key, m);
    }
    const now = (this.deps.now ?? Date.now)();
    return this.deps.known.insertMany(userId, [...unique.values()], now);
  }

  /**
   * FR-L53: undo after sending, for one direction. Without a target (an older client), every
   * direction of the item (D-028).
   */
  unmark(userId: string, itemId: number, target?: string): Promise<number> {
    return this.deps.known.remove(userId, itemId, target);
  }

  /** FR-L62: return selected rows (item + direction) or every row matching the filters. */
  restore(userId: string, input: RestoreKnownRequest): Promise<number> {
    if ('marks' in input) {
      const keys = new Map(input.marks.map((m) => [`${m.itemId}:${m.target}`, m]));
      return this.deps.known.removeKeys(userId, [...keys.values()]);
    }
    // Item ids alone come from an older client: every direction of those items.
    if ('itemIds' in input) return this.deps.known.removeMany(userId, [...new Set(input.itemIds)]);
    return this.deps.known.removeByFilter(userId, input.filter);
  }

  /** FR-L60/61: one page of "My known words". */
  async list(userId: string, input: KnownListInput): Promise<KnownListResponse> {
    const { sort, cursor: rawCursor, ...filter } = input;
    const cursor = rawCursor ? decodeCursor(sort, rawCursor) : null;
    const rows = await this.deps.known.list(userId, filter, sort, cursor, KNOWN_PAGE_SIZE + 1);
    const page = rows.slice(0, KNOWN_PAGE_SIZE);
    const hasMore = rows.length > KNOWN_PAGE_SIZE;

    const [categories, languages, total] = await Promise.all([
      // An item known in two directions has two rows: look its categories up once (D-028).
      this.deps.known.categoriesFor([...new Set(page.map((r) => r.itemId))]),
      this.deps.languages.listAll(),
      // The total is shown with "Return all N filtered"; computed on the first page only.
      cursor ? null : hasMore ? this.deps.known.count(userId, filter) : page.length,
    ]);
    const dirOf = new Map<string, TextDir>(languages.map((l) => [l.code, l.dir]));
    const dir = (code: string): TextDir => dirOf.get(code) ?? 'ltr';

    const items: KnownItem[] = page.map((r) => {
      const strategy = strategyFor(r.lang, r.knownTarget);
      const lines = strategy.answerLines(
        { ...r, literal: {}, synonyms: [], hints: [] }, // the parallel, else the meaning
        r.knownTarget,
      );
      const answerLang = strategy.kind === 'translation' ? r.knownTarget : r.lang;
      return {
        itemId: r.itemId,
        text: r.text,
        lang: r.lang,
        dir: dir(r.lang),
        type: r.type,
        multipleMeanings: r.multipleMeanings,
        knownTarget: r.knownTarget,
        answer: {
          kind: strategy.kind,
          lines,
          numbered: strategy.numbered(lines),
          lang: answerLang,
          dir: dir(answerLang),
        },
        categories: categories.get(r.itemId) ?? [],
        knownAt: r.knownAt,
        knownInCycle: r.knownInCycle,
      };
    });

    const last = page.at(-1);
    return {
      items,
      nextCursor: hasMore && last ? encodeCursor(sort, last) : null,
      total,
    };
  }
}
