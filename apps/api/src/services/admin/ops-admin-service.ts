import type { AdminStats, AuditEntryView, Settings, SettingsUpdate } from '@myvocab/contracts';
import { ValidationError } from '../../middleware/errors';
import type {
  Actor,
  AdminSettingsRepository,
  AuditFilter,
  AuditQueryRepository,
  TopicRepository,
  LanguageRepository,
  StatsRepository,
} from '../../repositories/interfaces';
import type { SettingsService } from '../settings-service';

const AUDIT_PAGE = 50;
const DAY = 24 * 60 * 60 * 1000;

/** Settings (FR-A50), audit log (FR-A70) and dashboard counts (FR-A1). */
export class OpsAdminService {
  constructor(
    private readonly deps: {
      settings: SettingsService;
      settingsWriter: AdminSettingsRepository;
      audit: AuditQueryRepository;
      stats: StatsRepository;
      languages: LanguageRepository;
      topics: TopicRepository;
      now?: () => number;
    },
  ) {}

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  getSettings(): Promise<Settings> {
    return this.deps.settings.get();
  }

  /** Validates the merged settings (cross-field rules), writes changed keys, audits before/after. */
  async updateSettings(patch: SettingsUpdate, actor: Actor): Promise<Settings> {
    const current = await this.deps.settings.get();
    const next: Settings = { ...current, ...patch } as Settings;
    next['loop.sizeOptions'] = [...new Set(next['loop.sizeOptions'])].sort((a, b) => a - b);

    const [languages, topics] = await Promise.all([
      this.deps.languages.listAll(),
      this.deps.topics.listAll(),
    ]);
    const active = new Set(languages.filter((l) => l.isActive).map((l) => l.code));
    const problems: { path: string; message: string }[] = [];
    const problem = (path: string, message: string) => problems.push({ path, message });
    if (!active.has(next['defaults.sourceLang'])) {
      problem('defaults.sourceLang', 'Must be an active language');
    }
    if (!active.has(next['defaults.targetLang'])) {
      problem('defaults.targetLang', 'Must be an active language');
    }
    const topicId = next['defaults.topicId'];
    if (topicId !== null && !topics.some((c) => c.id === topicId && c.isActive)) {
      problem('defaults.topicId', 'Must be an active topic or All topics');
    }
    if (!next['loop.sizeOptions'].includes(next['loop.defaultSize'])) {
      problem('loop.defaultSize', 'Must be one of the amount choices');
    }
    if (next['loop.sizeOptions'].some((n) => n > next['loop.maxSize'])) {
      problem('loop.sizeOptions', 'Amount choices can’t exceed the maximum amount');
    }
    if (problems.length > 0) throw new ValidationError('Invalid settings', problems);

    const changed: Record<string, unknown> = {};
    const audit: Record<string, { before: unknown; after: unknown }> = {};
    for (const key of Object.keys(next) as (keyof Settings)[]) {
      if (JSON.stringify(next[key]) !== JSON.stringify(current[key])) {
        changed[key] = next[key];
        audit[key] = { before: current[key], after: next[key] };
      }
    }
    if (Object.keys(changed).length === 0) return current;
    await this.deps.settingsWriter.write(
      changed,
      actor,
      { action: 'settings.update', details: { changes: audit } },
      this.now(),
    );
    return next;
  }

  async audit(filter: Omit<AuditFilter, 'beforeId'> & { cursor?: number | undefined }) {
    const { cursor, ...rest } = filter;
    const rows = await this.deps.audit.list({ ...rest, beforeId: cursor }, AUDIT_PAGE + 1);
    const entries: AuditEntryView[] = rows.slice(0, AUDIT_PAGE);
    return {
      entries,
      nextCursor: rows.length > AUDIT_PAGE ? (entries.at(-1)?.id ?? null) : null,
    };
  }

  async stats(): Promise<AdminStats> {
    const languages = await this.deps.languages.listAll();
    const s = await this.deps.stats.stats(
      languages.filter((l) => l.isActive).map((l) => l.code),
      this.now() - DAY,
    );
    return {
      items: {
        total: s.total,
        byLang: s.byLang,
        drafts: s.drafts,
        missingTranslation: s.missingTranslation,
        noExplanation: s.noExplanation,
        noHints: s.noHints,
        multipleMeanings: s.multipleMeanings,
        sampleSet: s.sampleSet,
        sampleByDirection: s.sampleByDirection,
      },
      users: { total: s.users, admins: s.admins },
      trash: s.trash,
      limitEvents24h: s.limitEvents,
    };
  }
}
