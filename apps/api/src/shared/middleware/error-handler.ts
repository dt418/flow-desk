import type { Context } from 'hono';
import { ZodError } from 'zod';
import { AppError } from '../errors';
import { logger } from '../lib/logger';

function isPrismaError(
  err: unknown,
): err is Error & { code: string; meta?: Record<string, unknown> } {
  return (
    err instanceof Error &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string' &&
    (err as { code: string }).code.startsWith('P')
  );
}

export async function errorHandler(err: Error, c: Context) {
  const requestId = c.get('requestId');

  if (err instanceof AppError) {
    return c.json(
      { message: err.message, code: err.code, details: err.details, requestId },
      err.status as 400 | 401 | 403 | 404 | 409 | 429,
    );
  }

  if (err instanceof ZodError) {
    return c.json(
      {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: err.flatten(),
        requestId,
      },
      400,
    );
  }

  if (isPrismaError(err)) {
    if (err.code === 'P2002') {
      return c.json(
        { message: 'Resource already exists', code: 'UNIQUE_VIOLATION', requestId },
        409,
      );
    }
    if (err.code === 'P2025') {
      return c.json({ message: 'Resource not found', code: 'NOT_FOUND', requestId }, 404);
    }
  }

  logger.error({ err, requestId }, 'unhandled error');
  return c.json({ message: 'Internal Server Error', code: 'INTERNAL_ERROR', requestId }, 500);
}
