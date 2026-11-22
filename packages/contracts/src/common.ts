import { z } from 'zod';

/** Building blocks shared by several contracts. */
export const langCodeSchema = z
  .string()
  .regex(/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/, 'Invalid language code');
export const dirSchema = z.enum(['ltr', 'rtl']);
export const itemIdSchema = z.number().int().positive();
/** A topic next to an item or in a picker; `nameHe` is its name in the Hebrew UI (D-080). */
export const topicRefSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  nameHe: z.string().nullable(),
});
