import type { AdminCategory, AdminLanguage } from '@myvocab/contracts';
import { ConflictError, NotFoundError } from '../../middleware/errors';
import type {
  Actor,
  AdminCategoryRepository,
  AdminLanguageRepository,
  LanguageRepository,
} from '../../repositories/interfaces';

/** Categories (FR-A30) and languages (FR-A35). Every change is audited in the same batch. */
export class CatalogAdminService {
  constructor(
    private readonly deps: {
      categories: AdminCategoryRepository;
      languages: LanguageRepository;
      adminLanguages: AdminLanguageRepository;
      now?: () => number;
    },
  ) {}

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  listCategories(): Promise<AdminCategory[]> {
    return this.deps.categories.listWithCounts();
  }

  private async assertSlugFree(slug: string, exceptId?: number): Promise<void> {
    const existing = await this.deps.categories.findBySlug(slug);
    if (existing && existing.id !== exceptId) {
      throw new ConflictError(`The slug "${slug}" is already used`, { reason: 'duplicate' });
    }
  }

  async createCategory(
    input: { slug: string; name: string; isActive?: boolean | undefined },
    actor: Actor,
  ): Promise<AdminCategory> {
    await this.assertSlugFree(input.slug);
    const id = await this.deps.categories.create(
      { slug: input.slug, name: input.name, isActive: input.isActive ?? true },
      actor,
      this.now(),
    );
    const created = await this.deps.categories.get(id);
    if (!created) throw new NotFoundError('Category not found');
    return created;
  }

  async updateCategory(
    id: number,
    patch: { slug?: string | undefined; name?: string | undefined; isActive?: boolean | undefined },
    actor: Actor,
  ): Promise<AdminCategory> {
    const current = await this.deps.categories.get(id);
    if (!current) throw new NotFoundError('Category not found');
    const changes: Partial<{ slug: string; name: string; isActive: boolean }> = {};
    const audit: Record<string, { before: unknown; after: unknown }> = {};
    for (const key of ['slug', 'name', 'isActive'] as const) {
      const value = patch[key];
      if (value !== undefined && value !== current[key]) {
        Object.assign(changes, { [key]: value });
        audit[key] = { before: current[key], after: value };
      }
    }
    if (Object.keys(changes).length === 0) return current;
    if (changes.slug) await this.assertSlugFree(changes.slug, id);
    const ok = await this.deps.categories.update(
      id,
      changes,
      actor,
      { action: 'category.update', details: { changes: audit } },
      this.now(),
    );
    if (!ok) throw new NotFoundError('Category not found');
    return (await this.deps.categories.get(id)) ?? current;
  }

  /** Blocked while items still use the category (deactivate it instead). */
  async deleteCategory(id: number, actor: Actor): Promise<void> {
    const current = await this.deps.categories.get(id);
    if (!current) throw new NotFoundError('Category not found');
    const blocked = () =>
      new ConflictError(
        `“${current.name}” is used by ${current.itemCount} ${current.itemCount === 1 ? 'item' : 'items'}. Deactivate it instead, or remove it from those items first.`,
        { reason: 'in_use', itemCount: current.itemCount },
      );
    if (current.itemCount > 0) throw blocked();
    const ok = await this.deps.categories.delete(
      id,
      actor,
      { action: 'category.delete', details: { snapshot: current } },
      this.now(),
    );
    if (!ok) throw blocked();
  }

  /** The given categories come first, in that order; the others follow in their current order. */
  async reorderCategories(ids: readonly number[], actor: Actor): Promise<AdminCategory[]> {
    const current = (await this.deps.categories.listWithCounts()).map((c) => c.id);
    const known = new Set(current);
    const first = [...new Set(ids)].filter((id) => known.has(id));
    const rest = current.filter((id) => !first.includes(id));
    await this.deps.categories.reorder([...first, ...rest], actor, this.now());
    return this.deps.categories.listWithCounts();
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

  /** At least one language stays active (the start card needs one). */
  async setLanguageActive(code: string, isActive: boolean, actor: Actor): Promise<AdminLanguage[]> {
    const all = await this.deps.languages.listAll();
    const language = all.find((l) => l.code === code);
    if (!language) throw new NotFoundError('Language not found');
    if (language.isActive === isActive) return this.listLanguages();
    if (!isActive && all.filter((l) => l.isActive).length <= 1) {
      throw new ConflictError('At least one language must stay active');
    }
    await this.deps.adminLanguages.setActive(code, isActive, actor, this.now());
    return this.listLanguages();
  }
}
