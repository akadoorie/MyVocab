import { z } from 'zod';
import { itemTypeSchema } from './loops';

/** Admin-editable runtime settings with their defaults (PRD §7.7). */
export const settingsSchema = z.object({
  'defaults.sourceLang': z.string().default('en'),
  'defaults.targetLang': z.string().default('he'),
  'defaults.categoryId': z.number().int().positive().nullable().default(null),
  'defaults.type': itemTypeSchema.default('word'),
  'loop.sizeOptions': z
    .array(z.number().int().min(1).max(200))
    .min(1)
    .max(10)
    .default([10, 20, 30, 40, 50]),
  'loop.defaultSize': z.number().int().min(1).default(10),
  'loop.maxSize': z.number().int().min(1).max(200).default(50),
  'guests.enabled': z.boolean().default(true),
  'guests.loopSize': z.number().int().min(1).max(50).default(5),
  'guests.loopsPerHour': z.number().int().min(1).max(1000).default(10),
  'users.cardsPerDay': z.number().int().min(1).max(100000).default(500),
  'undo.windowSeconds': z.number().int().min(1).max(15).default(4),
  'maintenance.enabled': z.boolean().default(false),
  'maintenance.message': z.string().max(280).default(''),
  'trash.retentionHours': z.number().int().min(1).max(720).default(24),
});

export type Settings = z.infer<typeof settingsSchema>;
export type SettingKey = keyof Settings;
export const SETTING_KEYS = Object.keys(settingsSchema.shape) as SettingKey[];
