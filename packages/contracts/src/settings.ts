import { z } from 'zod';

/** Admin-editable runtime settings with their defaults (PRD §7.7). */
export const settingsSchema = z.object({
  'defaults.sourceLang': z.string().default('en'),
  'defaults.targetLang': z.string().default('he'),
  'defaults.topicId': z.number().int().positive().nullable().default(null),
  'practice.sizeOptions': z
    .array(z.number().int().min(1).max(200))
    .min(1)
    .max(10)
    .default([10, 20, 30, 40, 50]),
  'practice.defaultSize': z.number().int().min(1).default(10),
  'practice.maxSize': z.number().int().min(1).max(200).default(50),
  /** The break between rounds moves on by itself after this many seconds; 0 = never (D-068). */
  'practice.continueSeconds': z.number().int().min(0).max(30).default(10),
  /** After "I don't know", Next moves on by itself after this many seconds; 0 = never (D-069). */
  'practice.nextSeconds': z.number().int().min(0).max(30).default(10),
  'guests.enabled': z.boolean().default(true),
  'guests.practiceSize': z.number().int().min(1).max(50).default(5),
  'guests.practicesPerHour': z.number().int().min(1).max(1000).default(10),
  'users.cardsPerDay': z.number().int().min(1).max(100000).default(500),
  'undo.windowSeconds': z.number().int().min(1).max(15).default(5),
  'maintenance.enabled': z.boolean().default(false),
  'maintenance.message': z.string().max(280).default(''),
  'trash.retentionHours': z.number().int().min(1).max(720).default(24),
});

export type Settings = z.infer<typeof settingsSchema>;
export type SettingKey = keyof Settings;
export const SETTING_KEYS = Object.keys(settingsSchema.shape) as SettingKey[];

type SettingsShape = typeof settingsSchema.shape;

/**
 * PUT /api/admin/settings: any subset of the settings, without defaults (a missing key keeps its
 * current value). Cross-field rules (e.g. `practice.defaultSize` in `practice.sizeOptions`, default
 * languages active) are checked by the server against the merged result (FR-A50).
 */
export const settingsUpdateSchema = z
  .object(
    Object.fromEntries(
      SETTING_KEYS.map((key) => [key, settingsSchema.shape[key].unwrap().optional()]),
    ) as { [K in SettingKey]: z.ZodOptional<ReturnType<SettingsShape[K]['unwrap']>> },
  )
  .strict();
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;
