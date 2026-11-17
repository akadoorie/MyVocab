import type { z } from 'zod';
import { ValidationError } from '../middleware/errors';

/** Parses untrusted input with a strict Zod schema; failures become a 400 VALIDATION_ERROR. */
export function parseOrThrow<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(
      'Invalid request',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

export async function readJson(req: { json(): Promise<unknown> }): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ValidationError('Body must be valid JSON');
  }
}
