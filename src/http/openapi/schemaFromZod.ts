import type { OpenAPIV3 } from 'openapi-types';
import { z, type ZodType } from 'zod';

export function schemaFromZod(schema: ZodType): OpenAPIV3.SchemaObject {
  const generated = z.toJSONSchema(schema) as OpenAPIV3.SchemaObject & { $schema?: string };
  const { $schema: _schema, ...rest } = generated;
  return rest;
}

export function propertySchema(schema: ZodType, name: string): OpenAPIV3.SchemaObject {
  const property = schemaFromZod(schema).properties?.[name];
  if (property === undefined || '$ref' in property) {
    throw new Error(`OpenAPI schema is missing object property ${name}.`);
  }
  return property;
}
