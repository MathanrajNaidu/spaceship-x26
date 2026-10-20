import { describe } from 'vitest';

import { InMemoryUsageSessionRepository } from '../../../src/infrastructure/persistence/in-memory/InMemoryUsageSessionRepository.js';
import { describeUsageSessionRepositoryContract } from './usageSessionRepository.contract.js';

describe('InMemoryUsageSessionRepository', () => {
  describeUsageSessionRepositoryContract(() => new InMemoryUsageSessionRepository());
});
