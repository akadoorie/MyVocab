import { z } from 'zod';

/** Building blocks shared by several contracts. */
export const langCodeSchema = z
  .string()
  .regex(/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/, 'Invalid language code');
export const dirSchema = z.enum(['ltr', 'rtl']);
export const itemTypeSchema = z.enum(['word', 'expr']);
export const itemIdSchema = z.number().int().positive();
