import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { buildTestApp } from '../support/buildTestApp.js';
import { toErrorBody, errorHandler } from '../../src/http/errors/errorHandler.js';

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
    stack?: string;
  };
}

function errorOf(response: { body: unknown }): ErrorResponse['error'] {
  return (response.body as ErrorResponse).error;
}
import type { ErrorLogger } from '../../src/http/logging.js';
import { AccessDeniedError } from '../../src/domain/errors/AccessDeniedError.js';
import { AuthenticationError } from '../../src/domain/errors/AuthenticationError.js';
import { AuthorizationError } from '../../src/domain/errors/AuthorizationError.js';
import { CapacityExceededError } from '../../src/domain/errors/ConflictError.js';
import { CrewRosterInvariantError } from '../../src/domain/errors/InvariantViolationError.js';
import { PassengerNotFoundError } from '../../src/domain/errors/NotFoundError.js';
import { InvalidTierError } from '../../src/domain/errors/ValidationError.js';

describe('createApp', () => {
  it('reports liveness without an actor header', async () => {
    const response = await request(buildTestApp().app).get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('keeps a caller-supplied request id', async () => {
    const response = await request(buildTestApp().app)
      .get('/api/v1/health')
      .set('X-Request-Id', 'trace-42');
    expect(response.headers['x-request-id']).toBe('trace-42');
  });

  it('replaces a request id that is empty or too long', async () => {
    const blank = await request(buildTestApp().app).get('/api/v1/health').set('X-Request-Id', '');
    expect(blank.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    const huge = await request(buildTestApp().app)
      .get('/api/v1/health')
      .set('X-Request-Id', 'a'.repeat(101));
    expect(huge.headers['x-request-id']).not.toBe('a'.repeat(101));
  });

  it('returns the standard 404 body for an unknown route', async () => {
    const response = await request(buildTestApp().app).get('/api/v1/does-not-exist');
    expect(response.status).toBe(404);
    const error = errorOf(response);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('No route for GET /api/v1/does-not-exist.');
    expect(error.requestId).toBe(response.headers['x-request-id']);
    expect(error.stack).toBeUndefined();
  });

  it('rejects malformed JSON', async () => {
    const response = await request(buildTestApp().app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"name":');
    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe('MALFORMED_JSON');
  });

  it('rejects a body over 100kb', async () => {
    const response = await request(buildTestApp().app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send({ name: 'a'.repeat(120_000) });
    expect(response.status).toBe(413);
    expect(errorOf(response).code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('hides unexpected failures behind a generic 500 and logs the cause', async () => {
    const logged: unknown[] = [];
    const logger: ErrorLogger = {
      error(context) {
        logged.push(context);
      },
    };
    const app = express();
    app.use((req, _res, next) => {
      req.id = 'req-500';
      next();
    });
    app.get('/boom', () => {
      throw new Error('database exploded');
    });
    app.use(errorHandler(logger));

    const response = await request(app).get('/boom');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        requestId: 'req-500',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('database exploded');
    expect(JSON.stringify(response.body)).not.toContain('stack');
    expect(logged).toHaveLength(1);
  });
});

describe('toErrorBody', () => {
  it('maps each domain error family onto its HTTP status', () => {
    expect(toErrorBody(new InvalidTierError('DIAMOND'), 'r').statusCode).toBe(400);
    expect(toErrorBody(new AuthenticationError('Missing X-Actor-Id header.'), 'r').statusCode).toBe(
      401,
    );
    expect(
      toErrorBody(new AuthorizationError('Crew lead access is required.'), 'r').statusCode,
    ).toBe(403);
    expect(toErrorBody(new AccessDeniedError('no', { requiredTier: 'GOLD' }), 'r').statusCode).toBe(
      403,
    );
    expect(toErrorBody(new PassengerNotFoundError('pas-1'), 'r').statusCode).toBe(404);
    expect(toErrorBody(new CapacityExceededError('Pod', 1, 1), 'r').statusCode).toBe(409);
    const invariant = toErrorBody(
      new CrewRosterInvariantError('Crew lead ids must be unique.', { ids: [] }),
      'r',
    );
    expect(invariant.statusCode).toBe(500);
    expect(invariant.body.error.code).toBe('INTERNAL_ERROR');
    expect(invariant.body.error.message).not.toContain('unique');
  });
});
