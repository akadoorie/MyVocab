import type { AdminTopic, AdminLanguage, LanguageCreate, LanguagePatch } from '@myvocab/contracts';
import { isSupportedScript } from '@myvocab/core';
import { ConflictError, NotFoundError, ValidationError } from '../../middleware/errors';
import type {
  Actor,
  AdminTopicRepository,
  AdminLanguageRepository,
  LanguageChanges,
  LanguageRepository,
} from '../../repositories/interfaces';

/** Topics (FR-A30) and languages (FR-A35). Every change is audited in the same batch. */
export class CatalogAdminService {
  constructor(
    private readonly deps: {
      topics: AdminTopicRepository;
      languages: LanguageRepository;
      adminLanguages: AdminLanguageRepository;
      now?: () => number;
    },
  ) {}

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  listTopics(): Promise<AdminTopic[]> {
    return this.deps.topics.listWithCounts();
  }

  private async assertSlugFree(slug: string, exceptId?: number): Promise<void> {
    const existing = await this.deps.topics.findBySlug(slug);
    if (existing && existing.id !== exceptId) {
      throw new ConflictError(`The slug "${slug}" is already used`, { reason: 'duplicate' });
    }
  }

  async createTopic(
    input: {
      slug: string;
      name: string;
      nameHe?: string | null | undefined;
      isActive?: boolean | undefined;
    },
    actor: Actor,
  ): Promise<AdminTopic> {
    await this.assertSlugFree(input.slug);
    const id = await this.deps.topics.create(
      {
        slug: input.slug,
        name: input.name,
        nameHe: input.nameHe || null,
        isActive: input.isActive ?? true,
      },
      actor,
      this.now(),
    );
    const created = await this.deps.topics.get(id);
    if (!created) throw new NotFoundError('Topic not found');
    return created;
  }

  async updateTopic(
    id: number,
    patch: {
      slug?: string | undefined;
      name?: string | undefined;
      /** '' or null clears it (the Hebrew UI then shows `name`). */
      nameHe?: string | null | undefined;
      isActive?: boolean | undefined;
      excludesTopicId?: number | null | undefined;
    },
    actor: Actor,
  ): Promise<AdminTopic> {
    const current = await this.deps.topics.get(id);
    if (!current) throw new NotFoundError('Topic not found');
    if (patch.excludesTopicId !== undefined && patch.excludesTopicId !== current.excludesTopicId) {
      await this.setExclusion(current, patch.excludesTopicId, actor);
    }
    const changes: Partial<{
      slug: string;
      name: string;
      nameHe: string | null;
      isActive: boolean;
    }> = {};
    const audit: Record<string, { before: unknown; after: unknown }> = {};
    for (const key of ['slug', 'name', 'nameHe', 'isActive'] as const) {
      const value =
        key === 'nameHe' && patch.nameHe !== undefined ? patch.nameHe || null : patch[key];
      if (value !== undefined && value !== current[key]) {
        Object.assign(changes, { [key]: value });
        audit[key] = { before: current[key], after: value };
      }
    }
    if (Object.keys(changes).length === 0) return (await this.deps.topics.get(id)) ?? current;
    if (changes.slug) await this.assertSlugFree(changes.slug, id);
    const ok = await this.deps.topics.update(
      id,
      changes,
      actor,
      { action: 'topic.update', details: { changes: audit } },
      this.now(),
    );
    if (!ok) throw new NotFoundError('Topic not found');
    return (await this.deps.topics.get(id)) ?? current;
  }

  /**
   * "Can't be combined with" (D-046): pairs two topics, both ways. Refused while some items are
   * in both (remove one of the two from them first).
   */
  private async setExclusion(
    current: AdminTopic,
    partnerId: number | null,
    actor: Actor,
  ): Promise<void> {
    if (partnerId !== null) {
      if (partnerId === current.id) {
        throw new ValidationError("A topic can't exclude itself", [
          { path: 'excludesTopicId', message: "A topic can't exclude itself" },
        ]);
      }
      const partner = await this.deps.topics.get(partnerId);
      if (!partner) throw new NotFoundError('Topic not found');
      const inBoth = await this.deps.topics.countInBoth(current.id, partnerId);
      if (inBoth > 0) {
        throw new ConflictError(
          `${inBoth} ${inBoth === 1 ? 'item is' : 'items are'} in both “${current.name}” and “${partner.name}”. Remove one of the two topics from ${inBoth === 1 ? 'it' : 'them'} first.`,
          { reason: 'in_both', itemCount: inBoth },
        );
      }
    }
    await this.deps.topics.setExclusion(
      current.id,
      partnerId,
      actor,
      {
        action: 'topic.update',
        details: {
          changes: { excludesTopicId: { before: current.excludesTopicId, after: partnerId } },
        },
      },
      this.now(),
    );
  }

  /** Blocked while items still use the topic (deactivate it instead). */
  async deleteTopic(id: number, actor: Actor): Promise<void> {
    const current = await this.deps.topics.get(id);
    if (!current) throw new NotFoundError('Topic not found');
    const blocked = () =>
      new ConflictError(
        `“${current.name}” is used by ${current.itemCount} ${current.itemCount === 1 ? 'item' : 'items'}. Deactivate it instead, or remove it from those items first.`,
        { reason: 'in_use', itemCount: current.itemCount },
      );
    if (current.itemCount > 0) throw blocked();
    const ok = await this.deps.topics.delete(
      id,
      actor,
      { action: 'topic.delete', details: { snapshot: current } },
      this.now(),
    );
    if (!ok) throw blocked();
  }

  /** The given topics come first, in that order; the others follow in their current order. */
  async reorderTopics(ids: readonly number[], actor: Actor): Promise<AdminTopic[]> {
    const current = (await this.deps.topics.listWithCounts()).map((c) => c.id);
    const known = new Set(current);
    const first = [...new Set(ids)].filter((id) => known.has(id));
    const rest = current.filter((id) => !first.includes(id));
    await this.deps.topics.reorder([...first, ...rest], actor, this.now());
    return this.deps.topics.listWithCounts();
  }

  async listLanguages(): Promise<AdminLanguage[]> {
    return (await this.deps.languages.listAll()).map((l) => ({
      code: l.code,
      name: l.name,
      nativeName: l.nativeName,
      dir: l.dir,
      script: l.script,
      isActive: l.isActive,
      sortOrder: l.sortOrder,
    }));
  }

  /**
   * Adds a language (D-027). It starts inactive, so its content can be prepared before learners
   * see it. The code, direction and script are fixed from then on.
   */
  async createLanguage(input: LanguageCreate, actor: Actor): Promise<AdminLanguage[]> {
    if (!isSupportedScript(input.script)) {
      throw new ValidationError('Invalid language', [
        {
          path: 'script',
          message: `Unknown script "${input.script}". Use a code such as Latn, Hebr, Arab or Cyrl.`,
        },
      ]);
    }
    const all = await this.deps.languages.listAll();
    const taken = () =>
      new ConflictError(`The language code "${input.code}" is already used`, {
        reason: 'duplicate',
      });
    if (all.some((l) => l.code === input.code)) throw taken();
    const created = await this.deps.adminLanguages.create(input, actor, this.now());
    if (!created) throw taken();
    return this.listLanguages();
  }

  /** Activate / deactivate or rename. At least one language stays active (the start card needs one). */
  async updateLanguage(code: string, patch: LanguagePatch, actor: Actor): Promise<AdminLanguage[]> {
    const all = await this.deps.languages.listAll();
    const language = all.find((l) => l.code === code);
    if (!language) throw new NotFoundError('Language not found');
    const changes: LanguageChanges = {};
    for (const key of ['name', 'nativeName', 'isActive'] as const) {
      const value = patch[key];
      if (value !== undefined && value !== language[key]) Object.assign(changes, { [key]: value });
    }
    if (Object.keys(changes).length === 0) return this.listLanguages();
    if (changes.isActive === false && all.filter((l) => l.isActive).length <= 1) {
      throw new ConflictError('At least one language must stay active');
    }
    await this.deps.adminLanguages.update(code, changes, actor, this.now());
    return this.listLanguages();
  }
}
