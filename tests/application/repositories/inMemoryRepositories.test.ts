import { describe, expect, it } from 'vitest';

import { slicePage } from '../../../src/application/pagination.js';
import { InMemoryPassengerRepository } from '../../../src/infrastructure/persistence/in-memory/InMemoryPassengerRepository.js';
import { InMemoryResourceRepository } from '../../../src/infrastructure/persistence/in-memory/InMemoryResourceRepository.js';
import { describePassengerRepositoryContract } from './passengerRepository.contract.js';
import { describeResourceRepositoryContract } from './resourceRepository.contract.js';

describe('InMemoryPassengerRepository', () => {
  describePassengerRepositoryContract(() => new InMemoryPassengerRepository());
});

describe('InMemoryResourceRepository', () => {
  describeResourceRepositoryContract(() => new InMemoryResourceRepository());
});

describe('slicePage', () => {
  it('windows a list and reports the unpaged total', () => {
    expect(slicePage(['a', 'b', 'c'], 2, 0)).toEqual({
      items: ['a', 'b'],
      total: 3,
      limit: 2,
      offset: 0,
    });
    expect(slicePage(['a', 'b', 'c'], 2, 2)).toEqual({
      items: ['c'],
      total: 3,
      limit: 2,
      offset: 2,
    });
    expect(slicePage(['a'], 2, 5).items).toEqual([]);
  });
});
