import { afterEach, describe } from 'vitest';

import {
  openSqliteDatabase,
  type SqliteDatabase,
} from '../../../src/infrastructure/persistence/sqlite/openSqliteDatabase.js';
import { SqliteAuditLogRepository } from '../../../src/infrastructure/persistence/sqlite/SqliteAuditLogRepository.js';
import { SqlitePassengerRepository } from '../../../src/infrastructure/persistence/sqlite/SqlitePassengerRepository.js';
import { SqliteResourceRepository } from '../../../src/infrastructure/persistence/sqlite/SqliteResourceRepository.js';
import { SqliteUsageSessionRepository } from '../../../src/infrastructure/persistence/sqlite/SqliteUsageSessionRepository.js';
import { describeAuditLogRepositoryContract } from './auditLogRepository.contract.js';
import { describePassengerRepositoryContract } from './passengerRepository.contract.js';
import { describeResourceRepositoryContract } from './resourceRepository.contract.js';
import { describeUsageSessionRepositoryContract } from './usageSessionRepository.contract.js';

const openDatabases: SqliteDatabase[] = [];

function openMemory(): SqliteDatabase {
  const database = openSqliteDatabase(':memory:');
  openDatabases.push(database);
  return database;
}

afterEach(() => {
  while (openDatabases.length > 0) {
    openDatabases.pop()?.close();
  }
});

describe('SqlitePassengerRepository', () => {
  describePassengerRepositoryContract(() => new SqlitePassengerRepository(openMemory().db));
});

describe('SqliteResourceRepository', () => {
  describeResourceRepositoryContract(() => new SqliteResourceRepository(openMemory().db));
});

describe('SqliteUsageSessionRepository', () => {
  describeUsageSessionRepositoryContract(() => new SqliteUsageSessionRepository(openMemory().db));
});

describe('SqliteAuditLogRepository', () => {
  describeAuditLogRepositoryContract(() => new SqliteAuditLogRepository(openMemory().db));
});
