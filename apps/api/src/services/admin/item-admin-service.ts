import {
  ADMIN_PAGE_SIZE,
  type AdminItem,
  type AdminItemCreate,
  type AdminItemListFilter,
  type AdminItemListResponse,
  type AdminItemPatch,
  type ItemIssueView,
  type TrashItem,
} from '@myvocab/contracts';
import {
  buildCard,
  missingLiteralWarnings,
  mixedScriptWarnings,
  multipleMeaningsWarnings,
  normalize,
  playableTargets,
  toLanguageMap,
  validateItem,
  type CardView,
  type ItemContent,
  type LanguageMap,
} from '@myvocab/core';
import { ConflictError, NotFoundError, ValidationError } from '../../middleware/errors';
import type {
  Actor,
  AdminItemRepository,
  TopicRepository,
  ItemChanges,
  ItemRecord,
  LanguageRepository,
  LanguageRow,
} from '../../repositories/interfaces';
import type { SettingsService } from '../settings-service';

const HOUR = 60 * 60 * 1000;
/** Items purged per cron run, in one batch (D1: one query; well under the batch limits). */
export const PURGE_BATCH = 100;

type LanguageContext = {
  all: LanguageRow[];
  allMap: LanguageMap;
  allCodes: string[];
  /** Learner-facing checks (the "not playable" warnings, the list filter) use active ones only. */
  activeCodes: string[];
};

function translationCounts(
  parallel: Record<string, string[]>,
  meaning: Record<string, string[]>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const list of [parallel, meaning])
    for (const [code, entries] of Object.entries(list))
      counts[code] = (counts[code] ?? 0) + entries.length;
  return counts;
}

/** The full JSON snapshot kept in the audit log for delete / restore / purge (FR-A24). */
export function itemSnapshot(rec: ItemRecord) {
  return {
    itemId: rec.id,
    text: rec.text,
    lang: rec.lang,
    multipleMeanings: rec.multipleMeanings,
    topics: rec.topicSlugs,
    parallel: rec.parallel,
    meaning: rec.meaning,
    literal: rec.literal,
    explanation: rec.explanation,
    synonyms: rec.synonyms,
    hints: rec.hints,
    status: rec.status,
    inSampleSet: rec.inSampleSet,
    version: rec.version,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    deletedAt: rec.deletedAt,
    deletedBy: rec.deletedBy,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return String((error as Error)?.message ?? error).includes('UNIQUE constraint failed');
}

const duplicateError = (itemId?: number | null) =>
  new ConflictError('An item with the same text already exists in this language', {
    reason: 'duplicate',
    ...(itemId ? { itemId } : {}),
  });

const staleError = () =>
  new ConflictError('This item was changed by someone else. Your last change was not saved.', {
    reason: 'stale',
  });

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Items in the admin area (PRD §7.2–7.3, §12.4). */
export class ItemAdminService {
  constructor(
    private readonly deps: {
      items: AdminItemRepository;
      languages: LanguageRepository;
      topics: TopicRepository;
      settings: SettingsService;
      now?: () => number;
    },
  ) {}

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  private async languageContext(): Promise<LanguageContext> {
    const all = await this.deps.languages.listAll();
    return {
      all,
      allMap: toLanguageMap(all),
      allCodes: all.map((l) => l.code),
      activeCodes: all.filter((l) => l.isActive).map((l) => l.code),
    };
  }

  private async checkTopics(ids: readonly number[] | undefined): Promise<number[] | undefined> {
    if (ids === undefined) return undefined;
    const unique = [...new Set(ids)].sort((a, b) => a - b);
    const all = await this.deps.topics.listAll();
    const byId = new Map(all.map((t) => [t.id, t]));
    const missing = unique.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new ValidationError('Unknown topic', [
        { path: 'topicIds', message: `Unknown topic: ${missing.join(', ')}` },
      ]);
    }
    // Topics that can't be together on one item (D-046).
    for (const id of unique) {
      const topic = byId.get(id);
      const partner = topic?.excludesTopicId ? byId.get(topic.excludesTopicId) : undefined;
      if (topic && partner && id < partner.id && unique.includes(partner.id)) {
        const message = `An item can't be in both “${topic.name}” and “${partner.name}”`;
        throw new ValidationError(message, [{ path: 'topicIds', message }]);
      }
    }
    return unique;
  }

  private warnings(item: ItemContent, ctx: LanguageContext): ItemIssueView[] {
    const playable = new Set(playableTargets(item, ctx.activeCodes));
    const name = (code: string) => ctx.all.find((l) => l.code === code)?.name ?? code;
    const notPlayable: ItemIssueView[] = ctx.activeCodes
      .filter((target) => !playable.has(target))
      .map((target) => ({
        path: target === item.lang ? 'explanation' : `meaning.${target}`,
        code: 'NOT_PLAYABLE',
        message:
          target === item.lang
            ? `No explanation: not playable ${item.lang.toUpperCase()} → ${target.toUpperCase()}`
            : `No ${name(target)} meaning: not playable ${item.lang.toUpperCase()} → ${target.toUpperCase()}`,
      }));
    return [
      ...notPlayable,
      ...multipleMeaningsWarnings(item),
      ...mixedScriptWarnings(item, ctx.allMap),
      ...missingLiteralWarnings(item),
    ];
  }

  private view(rec: ItemRecord, ctx: LanguageContext): AdminItem {
    return {
      itemId: rec.id,
      text: rec.text,
      lang: rec.lang,
      multipleMeanings: rec.multipleMeanings,
      topicIds: rec.topicIds,
      topics: rec.topicSlugs,
      parallel: rec.parallel,
      meaning: rec.meaning,
      literal: rec.literal,
      explanation: rec.explanation,
      synonyms: rec.synonyms,
      hints: rec.hints,
      status: rec.status,
      inSampleSet: rec.inSampleSet,
      version: rec.version,
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt,
      warnings: this.warnings(rec, ctx),
      // Every language, inactive ones too, for the editor's preview picker (D-027).
      playableTargets: playableTargets(rec, ctx.allCodes),
    };
  }

  private async live(id: number): Promise<ItemRecord> {
    const rec = await this.deps.items.get(id);
    if (!rec || rec.deletedAt !== null) throw new NotFoundError('Item not found');
    return rec;
  }

  async get(id: number): Promise<AdminItem> {
    const [rec, ctx] = await Promise.all([this.live(id), this.languageContext()]);
    return this.view(rec, ctx);
  }

  async list(filter: AdminItemListFilter): Promise<AdminItemListResponse> {
    const ctx = await this.languageContext();
    const { page, ...rest } = filter;
    const { rows, total } = await this.deps.items.list(
      rest,
      ctx.activeCodes,
      ADMIN_PAGE_SIZE,
      (page - 1) * ADMIN_PAGE_SIZE,
    );
    const topics = await this.deps.items.topicsFor(rows.map((r) => r.id));
    return {
      items: rows.map((r) => ({
        itemId: r.id,
        text: r.text,
        lang: r.lang,
        dir: ctx.allMap[r.lang]?.dir ?? 'ltr',
        multipleMeanings: r.multipleMeanings,
        topics: topics.get(r.id) ?? [],
        // Per language: parallel + meaning entries (either one answers a card, FR-L40).
        translationCounts: translationCounts(r.parallel, r.meaning),
        explanationCount: r.explanationCount,
        synonymCount: r.synonymCount,
        hintCount: r.hintCount,
        status: r.status,
        inSampleSet: r.inSampleSet,
        updatedAt: r.updatedAt,
      })),
      total,
      page,
      pageSize: ADMIN_PAGE_SIZE,
    };
  }

  async create(input: AdminItemCreate, actor: Actor): Promise<AdminItem> {
    const ctx = await this.languageContext();
    // Any known language, active or not: an inactive one is prepared before learners see it (D-027).
    const { value, errors } = validateItem(input, { languages: ctx.allMap });
    if (errors.length > 0) throw new ValidationError('Invalid item', errors);
    const topicIds = (await this.checkTopics(input.topicIds)) ?? [];
    const normalizedText = normalize(value.text);
    const duplicate = await this.deps.items.findDuplicate(value.lang, normalizedText);
    if (duplicate !== null) throw duplicateError(duplicate);

    const status = input.status ?? 'published';
    // New items start outside the sample set unless the admin ticks it (D-038).
    const inSampleSet = input.inSampleSet ?? false;
    let id: number;
    try {
      id = await this.deps.items.create(
        { ...value, normalizedText, status, inSampleSet, topicIds },
        actor,
        {
          action: 'item.create',
          details: { after: { ...value, status, inSampleSet, topicIds } },
        },
        this.now(),
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicateError();
      throw error;
    }
    return this.get(id);
  }

  /**
   * PATCH with optimistic concurrency (FR-A12, PRD §11.2 rule 7). Each list field replaces its
   * list; `lang` never changes. Only changed fields are written and audited (before/after).
   */
  async update(id: number, patch: AdminItemPatch, actor: Actor): Promise<AdminItem> {
    const [rec, ctx] = await Promise.all([this.live(id), this.languageContext()]);
    if (rec.version !== patch.version) throw staleError();

    // Translations into any known language, active or not (D-027); validateItem refuses unknown
    // codes.
    const { value, errors } = validateItem(
      {
        lang: rec.lang,
        text: patch.text ?? rec.text,
        multipleMeanings: patch.multipleMeanings ?? rec.multipleMeanings,
        parallel: patch.parallel ?? rec.parallel,
        meaning: patch.meaning ?? rec.meaning,
        literal: patch.literal ?? rec.literal,
        explanation: patch.explanation ?? rec.explanation,
        synonyms: patch.synonyms ?? rec.synonyms,
        hints: patch.hints ?? rec.hints,
      },
      { languages: ctx.allMap },
    );
    if (errors.length > 0) throw new ValidationError('Invalid item', errors);
    const topicIds = await this.checkTopics(patch.topicIds);

    const changes: ItemChanges = {};
    const audit: Record<string, { before: unknown; after: unknown }> = {};
    const fields = [
      'text',
      'multipleMeanings',
      'parallel',
      'meaning',
      'literal',
      'explanation',
      'synonyms',
      'hints',
    ] as const;
    for (const field of fields) {
      if (!same(value[field], rec[field])) {
        Object.assign(changes, { [field]: value[field] });
        audit[field] = { before: rec[field], after: value[field] };
      }
    }
    if (changes.text !== undefined) changes.normalizedText = normalize(value.text);
    if (patch.status !== undefined && patch.status !== rec.status) {
      changes.status = patch.status;
      audit.status = { before: rec.status, after: patch.status };
    }
    if (patch.inSampleSet !== undefined && patch.inSampleSet !== rec.inSampleSet) {
      changes.inSampleSet = patch.inSampleSet;
      audit.inSampleSet = { before: rec.inSampleSet, after: patch.inSampleSet };
    }
    const topicsChanged = topicIds !== undefined && !same(topicIds, rec.topicIds);
    if (topicsChanged) audit.topicIds = { before: rec.topicIds, after: topicIds };
    if (Object.keys(audit).length === 0) return this.view(rec, ctx);

    if (changes.text !== undefined) {
      const normalizedText = changes.normalizedText ?? rec.normalizedText;
      const duplicate = await this.deps.items.findDuplicate(rec.lang, normalizedText, id);
      if (duplicate !== null) throw duplicateError(duplicate);
    }

    let applied: boolean;
    try {
      applied = await this.deps.items.update(
        id,
        patch.version,
        changes,
        topicsChanged ? topicIds : undefined,
        actor,
        { action: 'item.update', details: { changes: audit } },
        this.now(),
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicateError();
      throw error;
    }
    if (!applied) throw staleError();
    return this.get(id);
  }

  /**
   * Cards for every playable direction, from the same builder as `POST /practices` (FR-A11),
   * including inactive languages so their cards can be checked before learners see them (D-027).
   */
  async preview(id: number): Promise<CardView[]> {
    const [rec, ctx] = await Promise.all([this.live(id), this.languageContext()]);
    return playableTargets(rec, ctx.allCodes).map((target) => buildCard(rec, target, ctx.allMap));
  }

  /** FR-A13: soft delete to Trash. */
  async trash(id: number, actor: Actor): Promise<void> {
    const rec = await this.live(id);
    const ok = await this.deps.items.trash(
      id,
      rec.version,
      actor,
      { action: 'item.trash', details: { snapshot: itemSnapshot(rec) } },
      this.now(),
    );
    if (!ok) throw staleError();
  }

  async listTrash(): Promise<{ items: TrashItem[]; retentionHours: number }> {
    const [rows, settings, ctx] = await Promise.all([
      this.deps.items.listTrash(500),
      this.deps.settings.get(),
      this.languageContext(),
    ]);
    const retentionHours = settings['trash.retentionHours'];
    return {
      retentionHours,
      items: rows.map((r) => ({
        itemId: r.id,
        text: r.text,
        lang: r.lang,
        dir: ctx.allMap[r.lang]?.dir ?? 'ltr',
        deletedAt: r.deletedAt,
        deletedBy: r.deletedBy,
        purgeAt: r.deletedAt + retentionHours * HOUR,
      })),
    };
  }

  private async trashed(id: number): Promise<ItemRecord> {
    const rec = await this.deps.items.get(id);
    if (!rec || rec.deletedAt === null) throw new NotFoundError('Item not found in Trash');
    return rec;
  }

  /** FR-A21: blocked if a non-deleted duplicate exists now; known marks come back with it. */
  async restore(id: number, actor: Actor): Promise<void> {
    const rec = await this.trashed(id);
    const duplicate = await this.deps.items.findDuplicate(rec.lang, rec.normalizedText);
    if (duplicate !== null) {
      throw new ConflictError(
        'Restore is blocked: another item with the same text now exists in this language. Delete or rename it first.',
        { reason: 'duplicate', itemId: duplicate },
      );
    }
    let ok: boolean;
    try {
      ok = await this.deps.items.restore(
        id,
        rec.version,
        actor,
        { action: 'item.restore', details: { snapshot: itemSnapshot(rec) } },
        this.now(),
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicateError();
      throw error;
    }
    if (!ok) throw staleError();
  }

  /** FR-A22: permanent delete (cascades to topic links and known marks). */
  async purge(id: number, actor: Actor): Promise<void> {
    const rec = await this.trashed(id);
    const ok = await this.deps.items.purge(
      id,
      rec.version,
      actor,
      { action: 'item.purge', details: { snapshot: itemSnapshot(rec) } },
      this.now(),
    );
    if (!ok) throw staleError();
  }

  /** FR-A23: the hourly cron purges items older than `trash.retentionHours`. */
  async purgeExpired(): Promise<number> {
    const now = this.now();
    const hours = (await this.deps.settings.get())['trash.retentionHours'];
    const expired = await this.deps.items.expiredTrash(now - hours * HOUR, PURGE_BATCH);
    return this.deps.items.purgeMany(
      expired.map((rec) => ({
        id: rec.id,
        version: rec.version,
        audit: { action: 'item.purge', details: { snapshot: itemSnapshot(rec), auto: true } },
      })),
      null,
      now,
    );
  }
}
