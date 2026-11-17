import type { Db } from '../../db/client';
import { appSettings } from '../../db/schema';
import type { SettingsRepository } from '../interfaces';

export class D1SettingsRepository implements SettingsRepository {
  constructor(private readonly db: Db) {}

  async getAll(): Promise<Record<string, unknown>> {
    const rows = await this.db
      .select({ key: appSettings.key, value: appSettings.value })
      .from(appSettings);
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }
}
