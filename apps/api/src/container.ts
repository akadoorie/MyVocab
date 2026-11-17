import { TurnstileVerifier } from './auth/turnstile';
import type { AppConfig } from './config';
import { createDb, type Db } from './db/client';
import { D1AccountRepository } from './repositories/d1/accounts';
import { D1AdminItemRepository } from './repositories/d1/admin-items';
import {
  D1AdminCategoryRepository,
  D1AdminLanguageRepository,
  D1AdminSettingsRepository,
  D1AdminUserRepository,
  D1AuditQueryRepository,
  D1StatsRepository,
} from './repositories/d1/admin-misc';
import { D1AuditRepository } from './repositories/d1/audit';
import { D1CategoryRepository } from './repositories/d1/categories';
import { D1ImportWriter } from './repositories/d1/import-writer';
import { D1ItemRepository } from './repositories/d1/items';
import { D1KnownRepository } from './repositories/d1/known';
import { D1LanguageRepository } from './repositories/d1/languages';
import { D1LoopRepository } from './repositories/d1/loops';
import { D1SettingsRepository } from './repositories/d1/settings';
import { D1UsageRepository } from './repositories/d1/usage';
import { AccountService } from './services/account-service';
import { CatalogAdminService } from './services/admin/catalog-admin-service';
import { ItemAdminService } from './services/admin/item-admin-service';
import { OpsAdminService } from './services/admin/ops-admin-service';
import { UserAdminService } from './services/admin/user-admin-service';
import { CsvImportService } from './services/csv-import-service';
import { KnownItemsService } from './services/known-items-service';
import { LoopService } from './services/loop-service';
import { MaintenanceService } from './services/maintenance-service';
import { SettingsService } from './services/settings-service';
import { UsageLimitService } from './services/usage-limit-service';

/** Per-request dependency wiring (PRD §10.4): concrete D1 implementations behind interfaces. */
export function createContainer(
  d1: D1Database,
  config?: Pick<AppConfig, 'TURNSTILE_SECRET_KEY' | 'turnstileHostname' | 'ownerEmails'>,
) {
  const db: Db = createDb(d1);
  const languages = new D1LanguageRepository(db);
  const categories = new D1CategoryRepository(db);
  const items = new D1ItemRepository(db);
  const audit = new D1AuditRepository(db);
  const settings = new SettingsService(new D1SettingsRepository(db));
  const limits = new UsageLimitService(new D1UsageRepository(db), audit);
  const adminItems = new ItemAdminService({
    items: new D1AdminItemRepository(db, d1),
    languages,
    categories,
    settings,
  });
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
    known: new KnownItemsService({ known: new D1KnownRepository(db), languages }),
    admin: {
      items: adminItems,
      catalog: new CatalogAdminService({
        categories: new D1AdminCategoryRepository(db, d1),
        languages,
        adminLanguages: new D1AdminLanguageRepository(db, d1),
      }),
      users: new UserAdminService({
        users: new D1AdminUserRepository(db, d1),
        owners: config?.ownerEmails ?? new Set<string>(),
      }),
      ops: new OpsAdminService({
        settings,
        settingsWriter: new D1AdminSettingsRepository(db, d1),
        audit: new D1AuditQueryRepository(db),
        stats: new D1StatsRepository(db),
        languages,
        categories,
      }),
    },
    maintenance: new MaintenanceService({ db, items: adminItems }),
    accounts: new AccountService({ accounts: new D1AccountRepository(db) }),
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
