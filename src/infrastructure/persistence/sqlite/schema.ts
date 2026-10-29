import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const schemaPath = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql');

export const SCHEMA_SQL = readFileSync(schemaPath, 'utf8');
