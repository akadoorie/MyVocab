import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ErrorCode, ErrorResponse } from '@myvocab/contracts';

/** Base class for errors that map to a JSON error response (PRD §10.4 "Errors"). */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: ContentfulStatusCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid request', details?: unknown) {
    super('VALIDATION_ERROR', 400, message, details);
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = 'Sign in required') {
    super('UNAUTHORIZED', 401, message);
  }
}
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super('FORBIDDEN', 403, message);
  }
}
export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super('NOT_FOUND', 404, message);
  }
}
export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: unknown) {
    super('CONFLICT', 409, message, details);
  }
}
export class RateLimitedError extends AppError {
  constructor(message = 'Too many requests', details?: unknown) {
    super('RATE_LIMITED', 429, message, details);
  }
}
export class BotCheckFailedError extends AppError {
  constructor(message = 'Bot check failed') {
    super('BOT_CHECK_FAILED', 403, message);
  }
}

function errorJson(c: Context, status: ContentfulStatusCode, body: ErrorResponse) {
  return c.json(body, status);
}

export const notFoundHandler: NotFoundHandler = (c) =>
  errorJson(c, 404, { error: { code: 'NOT_FOUND', message: 'Not found' } });

/**
 * Maps errors to `{ error: { code, message, details? } }`. Unknown errors become a generic 500:
 * no SQL, stack traces or content leave the Worker (PRD §14.4). Logs hold no request bodies.
 */
export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    const body: ErrorResponse = { error: { code: err.code, message: err.message } };
    if (err.details !== undefined) body.error.details = err.details;
    return errorJson(c, err.status, body);
  }
  // Content-free structured log: no bodies, no card text, no SQL (PRD §15 Observability).
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'unhandled',
      name: err.name,
      method: c.req.method,
      path: c.req.path,
      requestId: c.req.header('cf-ray') ?? null,
    }),
  );
  return errorJson(c, 500, { error: { code: 'INTERNAL', message: 'Something went wrong' } });
};
