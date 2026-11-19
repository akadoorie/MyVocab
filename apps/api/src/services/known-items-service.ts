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

const cursorSchema = z.tuple([z.union([z.number().int(), z.string().max(400)]), z.number().int()]);

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
  return toBase64Url(JSON.stringify([key, row.itemId]));
}

export function decodeCursor(sort: KnownSort, cursor: string): KnownCursor {
  try {
    const [key, itemId] = cursorSchema.parse(JSON.parse(fromBase64Url(cursor)));
    if ((sort === 'az') !== (typeof key === 'string')) throw new Error('cursor/sort mismatch');
    return { key, itemId };
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

  /** FR-L51/52: idempotent batch upsert. Returns how many marks were new. */
  async mark(userId: string, marks: readonly KnownMarkInput[]): Promise<number> {
    const unique = new Map<number, KnownMarkInput>();
    for (const m of marks) if (!unique.has(m.itemId)) unique.set(m.itemId, m);
    const now = (this.deps.now ?? Date.now)();
    return this.deps.known.insertMany(userId, [...unique.values()], now);
  }

  /** FR-L53 (undo after sending) and "Return to loops" for one row. */
  unmark(userId: string, itemId: number): Promise<number> {
    return this.deps.known.remove(userId, itemId);
  }

  /** FR-L62: return selected rows or every row matching the filters. */
  restore(userId: string, input: RestoreKnownRequest): Promise<number> {
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
      this.deps.known.categoriesFor(page.map((r) => r.itemId)),
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
