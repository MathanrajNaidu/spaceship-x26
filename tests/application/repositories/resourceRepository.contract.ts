import { expect, it } from 'vitest';

import type { ResourceRepository } from '../../../src/application/ports/ResourceRepository.js';
import { Resource } from '../../../src/domain/resource/Resource.js';
import { MembershipTier } from '../../../src/domain/tier/MembershipTier.js';

const EARLY = new Date('2026-01-01T00:00:00.000Z');
const LATER = new Date('2026-03-01T00:00:00.000Z');

function resource(
  id: string,
  type: 'FOOD_STATION' | 'PRIVATE_CABIN' | 'LUXURY_O2_POD' = 'FOOD_STATION',
  now = EARLY,
): Resource {
  return Resource.provision({ id, name: id, type, capacity: 2, now });
}

export function describeResourceRepositoryContract(
  createRepository: () => ResourceRepository,
): void {
  it('returns null when the resource is missing', async () => {
    expect(await createRepository().findById('missing')).toBeNull();
  });

  it('round-trips a resource and keeps unsaved mutations out of the store', async () => {
    const repository = createRepository();
    const original = resource('res-1');
    await repository.save(original);
    original.decommission(LATER);

    const stored = await repository.findById('res-1');
    expect(stored?.status).toBe('ACTIVE');
    stored?.decommission(LATER);
    expect((await repository.findById('res-1'))?.status).toBe('ACTIVE');
    if (!stored) {
      throw new Error('expected a stored resource');
    }
    await repository.save(stored);
    expect((await repository.findById('res-1'))?.status).toBe('DECOMMISSIONED');
  });

  it('filters by status, minimum tier and type, ordered by provision time then id', async () => {
    const repository = createRepository();
    const cabin = Resource.provision({
      id: 'res-b',
      name: 'Cabin',
      type: 'PRIVATE_CABIN',
      capacity: 1,
      now: EARLY,
    });
    cabin.decommission(LATER);
    await repository.save(
      Resource.provision({
        id: 'res-c',
        name: 'Luxury',
        type: 'LUXURY_O2_POD',
        capacity: 1,
        minimumTier: MembershipTier.PLATINUM,
        now: LATER,
      }),
    );
    await repository.save(cabin);
    await repository.save(resource('res-a', 'FOOD_STATION', EARLY));

    expect((await repository.search({ status: 'ACTIVE' })).map((item) => item.id)).toEqual([
      'res-a',
      'res-c',
    ]);
    expect((await repository.search({ minimumTier: 'GOLD' })).map((item) => item.id)).toEqual([
      'res-b',
    ]);
    expect((await repository.search({ type: 'LUXURY_O2_POD' })).map((item) => item.id)).toEqual([
      'res-c',
    ]);
    expect((await repository.search({})).map((item) => item.id)).toEqual([
      'res-a',
      'res-b',
      'res-c',
    ]);
  });
}
