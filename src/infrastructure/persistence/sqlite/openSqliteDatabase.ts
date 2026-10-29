import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { SCHEMA_SQL } from './schema.js';

export interface SqliteDatabase {
  readonly db: DatabaseSync;
  isEmpty(): boolean;
  close(): void;
}

export function openSqliteDatabase(path: string): SqliteDatabase {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA_SQL);
  return {
    db,
    isEmpty(): boolean {
      const row = db.prepare('SELECT COUNT(*) AS count FROM resources').get() as
        { count: number } | undefined;
      return (row?.count ?? 0) === 0;
    },
    close(): void {
      db.close();
    },
  };
}
