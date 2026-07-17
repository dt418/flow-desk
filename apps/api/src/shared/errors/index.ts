export class AppError extends Error {
  constructor(
    public status: number,
    public override message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad Request', details?: unknown) {
    super(400, message, 'BAD_REQUEST', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, message, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, message, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not Found') {
    super(404, message, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: unknown) {
    super(409, message, 'CONFLICT', details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too Many Requests', retryAfter?: number) {
    super(429, message, 'RATE_LIMIT', { retryAfter });
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'Payload Too Large', details?: unknown) {
    super(413, message, 'PAYLOAD_TOO_LARGE', details);
  }
}

export class LLMError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(502, message, 'LLM_UPSTREAM', details);
  }
}
