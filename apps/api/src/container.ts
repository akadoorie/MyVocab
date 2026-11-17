import { createDb, type Db } from './db/client';
import { D1CategoryRepository } from './repositories/d1/categories';
import { D1ImportWriter } from './repositories/d1/import-writer';
import { D1ItemRepository } from './repositories/d1/items';
import { D1LanguageRepository } from './repositories/d1/languages';
import { CsvImportService } from './services/csv-import-service';

/** Per-request dependency wiring (PRD §10.4): concrete D1 implementations behind interfaces. */
export function createContainer(d1: D1Database) {
  const db: Db = createDb(d1);
  const languages = new D1LanguageRepository(db);
  const categories = new D1CategoryRepository(db);
  const items = new D1ItemRepository(db);
  return {
    db,
    languages,
    categories,
    items,
    csvImport: new CsvImportService({
      languages,
      categories,
      items,
      writer: new D1ImportWriter(db, d1),
    }),
  };
}

export type Container = ReturnType<typeof createContainer>;
