import {
  normalize,
  parseImportCsv,
  planImport,
  toLanguageMap,
  type CsvIssue,
  type ImportTotals,
} from '@myvocab/core';
import type {
  Actor,
  CategoryRepository,
  ImportWriter,
  ItemRepository,
  LanguageRepository,
} from '../repositories/interfaces';

/** Admin upload limits (PRD §8.3). `pnpm db:seed` passes no limits. */
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 5000;

export type ImportInput = {
  csvText: string;
  fileName: string;
  dryRun: boolean;
  createMissingCategories: boolean;
  actor: Actor;
  limits?: { maxBytes: number; maxRows: number } | null;
};

export type ImportReport = {
  dryRun: boolean;
  committed: boolean;
  totals: ImportTotals | null;
  errors: CsvIssue[];
  warnings: CsvIssue[];
  /** Items that changed while the import ran and were left untouched (re-run to merge them). */
  skippedConcurrent: number;
  batches: number;
};

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * CSV import (PRD §8.3), shared by the admin upload and `pnpm db:seed`. Dry run parses, validates
 * and plans without writing. Commit is refused if the plan has errors.
 */
export class CsvImportService {
  constructor(
    private readonly deps: {
      languages: LanguageRepository;
      categories: CategoryRepository;
      items: ItemRepository;
      writer: ImportWriter;
    },
  ) {}

  async run(input: ImportInput): Promise<ImportReport> {
    const limits =
      input.limits === undefined
        ? { maxBytes: IMPORT_MAX_BYTES, maxRows: IMPORT_MAX_ROWS }
        : input.limits;
    const report: ImportReport = {
      dryRun: input.dryRun,
      committed: false,
      totals: null,
      errors: [],
      warnings: [],
      skippedConcurrent: 0,
      batches: 0,
    };

    if (limits && new TextEncoder().encode(input.csvText).length > limits.maxBytes) {
      report.errors.push({
        row: 0,
        column: '',
        message: `The file is larger than ${limits.maxBytes / 1024 / 1024} MB`,
      });
      return report;
    }

    const allLanguages = await this.deps.languages.listAll();
    const languages = toLanguageMap(allLanguages.filter((l) => l.isActive));
    const parsed = parseImportCsv(input.csvText, {
      languages,
      ...(limits ? { maxRows: limits.maxRows } : {}),
    });
    report.errors.push(...parsed.errors);
    if (parsed.errors.some((e) => e.row <= 1)) return report; // file-level problems: stop here

    const keys = parsed.rows.map((r) => ({
      lang: r.content.lang,
      type: r.content.type,
      normalizedText: normalize(r.content.text),
    }));
    const [existing, categories] = await Promise.all([
      this.deps.items.findByIdentities(keys),
      this.deps.categories.listAll(),
    ]);
    const plan = planImport(parsed.rows, {
      languages,
      existing,
      knownCategories: new Set(categories.map((c) => c.slug)),
      createMissingCategories: input.createMissingCategories,
    });
    report.errors.push(...plan.errors);
    report.errors.sort((a, b) => a.row - b.row);
    report.warnings = plan.warnings;
    report.totals = plan.totals;

    if (input.dryRun || report.errors.length > 0) return report;

    const versions = new Map([...existing.values()].map((e) => [e.id, e.version]));
    const result = await this.deps.writer.write(plan, versions, input.actor, {
      fileName: input.fileName,
      sha256: await sha256Hex(input.csvText),
      totals: plan.totals,
    });
    report.committed = true;
    report.skippedConcurrent = result.skippedConcurrent;
    report.batches = result.batches;
    return report;
  }
}
