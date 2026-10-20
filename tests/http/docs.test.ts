import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPI } from 'openapi-types';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { openApiDocument } from '../../src/http/openapi/document.js';
import { documentedOperations, registeredOperations } from '../../src/http/openapi/operations.js';
import { buildTestApp } from '../support/buildTestApp.js';

describe('docs HTTP', () => {
  it('returns HTML from GET /docs', async () => {
    const { app } = buildTestApp();
    const response = await request(app).get('/docs');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/html/);
    expect(response.text).toContain('swagger-ui');
    expect(response.text).toContain('<base href="/docs/">');

    const stylesheet = await request(app).get('/docs/swagger-ui.css');
    expect(stylesheet.status).toBe(200);
    expect(stylesheet.headers['content-type']).toMatch(/css/);
  });

  it('serves a valid document at GET /openapi.json', async () => {
    const { app } = buildTestApp();
    const response = await request(app).get('/openapi.json');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/json/);
    await expectOpenApi3(response.body as OpenAPI.Document);
  });

  it('lists the same operations as the Express app', () => {
    const { app } = buildTestApp();
    expect(registeredOperations(app)).toEqual(documentedOperations(openApiDocument));
  });
});

async function expectOpenApi3(document: OpenAPI.Document): Promise<void> {
  const api = await SwaggerParser.validate(document);
  expect('openapi' in api && api.openapi).toMatch(/^3\./);
}
