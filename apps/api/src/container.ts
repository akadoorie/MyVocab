import { TurnstileVerifier } from './auth/turnstile';
import type { AppConfig } from './config';
import { createDb, type Db } from './db/client';
import { D1AuditRepository } from './repositories/d1/audit';
import { D1CategoryRepository } from './repositories/d1/categories';
import { D1ImportWriter } from './repositories/d1/import-writer';
import { D1ItemRepository } from './repositories/d1/items';
import { D1LanguageRepository } from './repositories/d1/languages';
import { D1LoopRepository } from './repositories/d1/loops';
import { D1SettingsRepository } from './repositories/d1/settings';
import { D1UsageRepository } from './repositories/d1/usage';
import { CsvImportService } from './services/csv-import-service';
import { LoopService } from './services/loop-service';
import { SettingsService } from './services/settings-service';
import { UsageLimitService } from './services/usage-limit-service';

/** Per-request dependency wiring (PRD §10.4): concrete D1 implementations behind interfaces. */
export function createContainer(
  d1: D1Database,
  config?: Pick<AppConfig, 'TURNSTILE_SECRET_KEY' | 'turnstileHostname'>,
) {
  const db: Db = createDb(d1);
  const languages = new D1LanguageRepository(db);
  const categories = new D1CategoryRepository(db);
  const items = new D1ItemRepository(db);
  const audit = new D1AuditRepository(db);
  const settings = new SettingsService(new D1SettingsRepository(db));
  const limits = new UsageLimitService(new D1UsageRepository(db), audit);
  return {
    db,
    languages,
    categories,
    items,
    audit,
    settings,
    limits,
    csvImport: new CsvImportService({
      languages,
      categories,
      items,
      writer: new D1ImportWriter(db, d1),
    }),
    loops: new LoopService({
      languages,
      categories,
      loops: new D1LoopRepository(db),
      settings,
      limits,
      botCheck: new TurnstileVerifier(
        config?.TURNSTILE_SECRET_KEY ?? '',
        config?.turnstileHostname ?? null,
      ),
    }),
  };
}

export type Container = ReturnType<typeof createContainer>;
