import { settingsSchema, SETTING_KEYS, type Settings } from '@myvocab/contracts';
import type { SettingsRepository } from '../repositories/interfaces';

/**
 * Runtime settings (PRD §7.7): stored values merged over typed defaults, read once per request.
 * A stored value that no longer validates falls back to its default instead of breaking the app.
 */
export class SettingsService {
  private cached: Promise<Settings> | null = null;

  constructor(private readonly repo: SettingsRepository) {}

  get(): Promise<Settings> {
    this.cached ??= this.load();
    return this.cached;
  }

  private async load(): Promise<Settings> {
    const stored = await this.repo.getAll();
    const defaults = settingsSchema.parse({});
    const merged: Record<string, unknown> = { ...defaults };
    for (const key of SETTING_KEYS) {
      if (!(key in stored)) continue;
      const parsed = settingsSchema.shape[key].safeParse(stored[key]);
      if (parsed.success) merged[key] = parsed.data;
    }
    const settings = merged as Settings;
    if (!settings['loop.sizeOptions'].includes(settings['loop.defaultSize'])) {
      settings['loop.defaultSize'] =
        settings['loop.sizeOptions'][0] ?? defaults['loop.defaultSize'];
    }
    return settings;
  }
}
