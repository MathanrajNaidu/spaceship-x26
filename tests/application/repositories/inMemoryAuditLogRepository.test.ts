import { describe } from 'vitest';

import { InMemoryAuditLogRepository } from '../../../src/infrastructure/persistence/in-memory/InMemoryAuditLogRepository.js';
import { describeAuditLogRepositoryContract } from './auditLogRepository.contract.js';

describe('InMemoryAuditLogRepository', () => {
  describeAuditLogRepositoryContract(() => new InMemoryAuditLogRepository());
});
