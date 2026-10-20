import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPI } from 'openapi-types';
import { describe, expect, it } from 'vitest';

import { openApiDocument } from '../../src/http/openapi/document.js';
import { schemaFromZod } from '../../src/http/openapi/schemaFromZod.js';
import { createPassengerSchema } from '../../src/http/schemas/passenger.schema.js';
import { provisionResourceSchema } from '../../src/http/schemas/resource.schema.js';
import { startSessionSchema } from '../../src/http/schemas/session.schema.js';

const SEEDED_ACTORS = [
  'crew-ada',
  'crew-bao',
  'crew-mira',
  'pas-jonah',
  'pas-priya',
  'pas-elena',
] as const;

describe('OpenAPI document', () => {
  it('is valid OpenAPI 3', async () => {
    await expectOpenApi3(structuredClone(openApiDocument));
  });

  it('uses X-Actor-Id as an apiKey and documents the error statuses', () => {
    expect(openApiDocument.components?.securitySchemes?.actorId).toMatchObject({
      type: 'apiKey',
      in: 'header',
      name: 'X-Actor-Id',
    });

    const statuses = new Set<string>();
    for (const item of Object.values(openApiDocument.paths)) {
      if (!item) continue;
      for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
        const operation = item[method];
        if (!operation) continue;
        for (const status of Object.keys(operation.responses)) statuses.add(status);
      }
    }
    for (const status of ['400', '401', '403', '404', '409']) {
      expect(statuses.has(status)).toBe(true);
    }
  });

  it('includes the seeded actors and reuses the request zod schemas', () => {
    const text = JSON.stringify(openApiDocument);
    for (const id of SEEDED_ACTORS) expect(text).toContain(id);

    const create = openApiDocument.paths['/api/v1/passengers']?.post?.requestBody;
    const provision = openApiDocument.paths['/api/v1/resources']?.post?.requestBody;
    const start = openApiDocument.paths['/api/v1/me/sessions']?.post?.requestBody;
    expect(bodySchema(create)).toEqual(schemaFromZod(createPassengerSchema));
    expect(bodySchema(provision)).toEqual(schemaFromZod(provisionResourceSchema));
    expect(bodySchema(start)).toEqual(schemaFromZod(startSessionSchema));
  });
});

async function expectOpenApi3(document: OpenAPI.Document): Promise<void> {
  const api = await SwaggerParser.validate(document);
  expect('openapi' in api && api.openapi).toMatch(/^3\./);
}

function bodySchema(body: unknown): unknown {
  if (typeof body !== 'object' || body === null || !('content' in body)) return undefined;
  const content = body.content;
  if (typeof content !== 'object' || content === null || !('application/json' in content)) {
    return undefined;
  }
  const json = content['application/json'];
  if (typeof json !== 'object' || json === null || !('schema' in json)) return undefined;
  return json.schema;
}
