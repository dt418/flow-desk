import { AppError, BadRequestError, ForbiddenError, NotFoundError, ConflictError } from './index';

export const ErrorCode = {
  LABEL_NAME_TAKEN: 'LABEL_NAME_TAKEN',
  LABEL_LIMIT_REACHED: 'LABEL_LIMIT_REACHED',
  LABEL_IN_USE: 'LABEL_IN_USE',
  INVALID_LABEL_COLOR: 'INVALID_LABEL_COLOR',

  WORKSPACE_LIMIT_REACHED: 'WORKSPACE_LIMIT_REACHED',
  WORKSPACE_NAME_TAKEN: 'WORKSPACE_NAME_TAKEN',

  TASK_LABEL_CROSS_WORKSPACE: 'TASK_LABEL_CROSS_WORKSPACE',
} as const;

export type ErrorCodeT = (typeof ErrorCode)[keyof typeof ErrorCode];

export function withCode(
  status: number,
  code: ErrorCodeT | string,
  message: string,
  details?: unknown,
): AppError {
  switch (status) {
    case 400:
      return new BadRequestErrorWithCode(message, code, details);
    case 403:
      return new ForbiddenErrorWithCode(message, code);
    case 404:
      return new NotFoundErrorWithCode(message, code);
    case 409:
      return new ConflictErrorWithCode(message, code, details);
    default:
      return new AppError(status, message, code, details);
  }
}

class BadRequestErrorWithCode extends BadRequestError {
  constructor(message: string, code: string, details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

class ForbiddenErrorWithCode extends ForbiddenError {
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

class NotFoundErrorWithCode extends NotFoundError {
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

class ConflictErrorWithCode extends ConflictError {
  constructor(message: string, code: string, details?: unknown) {
    super(message, details);
    this.code = code;
  }
}
