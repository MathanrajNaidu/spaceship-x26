import type { ErrorRequestHandler, Request, Response } from 'express';
import { ZodError } from 'zod';

import type { AppLogger } from '../logging.js';
import { HttpProblem } from './HttpProblem.js';
import { AccessDeniedError } from '../../domain/errors/AccessDeniedError.js';
import { AuthenticationError } from '../../domain/errors/AuthenticationError.js';
import { AuthorizationError } from '../../domain/errors/AuthorizationError.js';
import { ConflictError } from '../../domain/errors/ConflictError.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { InvariantViolationError } from '../../domain/errors/InvariantViolationError.js';
import { NotFoundError } from '../../domain/errors/NotFoundError.js';
import { ValidationError } from '../../domain/errors/ValidationError.js';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: Readonly<Record<string, unknown>>;
  };
}

export function errorHandler(logger: AppLogger): ErrorRequestHandler {
  return (err: unknown, req: Request, res: Response, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const requestId = req.id || 'unknown';
    const mapped = toErrorBody(err, requestId);
    if (mapped.body.error.code === 'INTERNAL_ERROR') {
      logger.error({ requestId, err }, err instanceof Error ? err.message : 'Unexpected failure');
    }
    res.status(mapped.statusCode).json(mapped.body);
  };
}

export function toErrorBody(
  err: unknown,
  requestId: string,
): { statusCode: number; body: ErrorBody } {
  if (err instanceof ZodError) {
    return json(400, 'VALIDATION_ERROR', 'Request validation failed.', requestId, {
      issues: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  if (isParseFailure(err)) {
    return json(400, 'MALFORMED_JSON', 'Request body is not valid JSON.', requestId);
  }
  if (isPayloadTooLarge(err)) {
    return json(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the 100kb limit.', requestId);
  }
  if (err instanceof HttpProblem) {
    return json(err.statusCode, err.code, err.message, requestId, err.details);
  }
  if (err instanceof DomainError) {
    const statusCode = statusForDomainError(err);
    if (statusCode === 500) {
      return json(500, 'INTERNAL_ERROR', 'An unexpected error occurred.', requestId);
    }
    return json(statusCode, err.code, err.message, requestId, err.details);
  }
  return json(500, 'INTERNAL_ERROR', 'An unexpected error occurred.', requestId);
}

function statusForDomainError(error: DomainError): number {
  if (error instanceof InvariantViolationError) {
    return 500;
  }
  if (error instanceof ValidationError) {
    return 400;
  }
  if (error instanceof AuthenticationError) {
    return 401;
  }
  if (error instanceof AuthorizationError || error instanceof AccessDeniedError) {
    return 403;
  }
  if (error instanceof NotFoundError) {
    return 404;
  }
  if (error instanceof ConflictError) {
    return 409;
  }
  return 500;
}

function json(
  statusCode: number,
  code: string,
  message: string,
  requestId: string,
  details?: Readonly<Record<string, unknown>>,
): { statusCode: number; body: ErrorBody } {
  return {
    statusCode,
    body: {
      error: {
        code,
        message,
        requestId,
        ...(details === undefined ? {} : { details }),
      },
    },
  };
}

function isParseFailure(err: unknown): boolean {
  return entityType(err) === 'entity.parse.failed';
}

function isPayloadTooLarge(err: unknown): boolean {
  return entityType(err) === 'entity.too.large';
}

function entityType(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null || !('type' in err)) {
    return undefined;
  }
  const type = err.type;
  return typeof type === 'string' ? type : undefined;
}
