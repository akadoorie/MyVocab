import { z } from 'zod';

/** GET /api/health (PRD §12.1). */
export const healthResponseSchema = z.object({
  ok: z.literal(true),
  version: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
