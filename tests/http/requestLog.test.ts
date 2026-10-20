import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import type { AppLogger } from '../../src/http/logging.js';
import { requestId } from '../../src/http/middleware/requestId.js';
import { requestLog } from '../../src/http/middleware/requestLog.js';

describe('request log', () => {
  it('records the request id, method, path and status after the response finishes', async () => {
    const entries: Record<string, unknown>[] = [];
    const logger: AppLogger = {
      info(context) {
        entries.push(context);
      },
      error() {
        return undefined;
      },
    };
    const app = express();
    app.use(requestId);
    app.use(requestLog(logger));
    app.get('/ping', (_req, res) => {
      res.status(204).end();
    });
    const response = await request(app).get('/ping').set('X-Request-Id', 'req-1');
    expect(response.status).toBe(204);
    expect(entries[0]).toMatchObject({
      requestId: 'req-1',
      method: 'GET',
      path: '/ping',
      statusCode: 204,
    });
  });
});
