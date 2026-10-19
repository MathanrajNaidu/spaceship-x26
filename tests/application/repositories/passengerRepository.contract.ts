import { expect, it } from 'vitest';

import type { PassengerRepository } from '../../../src/application/ports/PassengerRepository.js';
import { Passenger } from '../../../src/domain/passenger/Passenger.js';
import { MembershipTier } from '../../../src/domain/tier/MembershipTier.js';

const EARLY = new Date('2026-01-01T00:00:00.000Z');
const LATER = new Date('2026-02-01T00:00:00.000Z');

function passenger(id: string, tier = MembershipTier.SILVER, now = EARLY): Passenger {
  return Passenger.create({ id, name: id, tier, now });
}

export function describePassengerRepositoryContract(
  createRepository: () => PassengerRepository,
): void {
  it('returns null when the passenger is missing', async () => {
    const repository = createRepository();
    expect(await repository.findById('missing')).toBeNull();
  });

  it('round-trips a passenger and isolates later mutations until the next save', async () => {
    const repository = createRepository();
    const original = passenger('pas-1', MembershipTier.GOLD);
    await repository.save(original);
    original.rename('Changed', LATER);

    const stored = await repository.findById('pas-1');
    expect(stored?.name).toBe('pas-1');
    expect(stored?.tier).toBe(MembershipTier.GOLD);

    stored?.rename('Priya Nair', LATER);
    expect((await repository.findById('pas-1'))?.name).toBe('pas-1');

    if (!stored) {
      throw new Error('expected a stored passenger');
    }
    await repository.save(stored);
    expect((await repository.findById('pas-1'))?.name).toBe('Priya Nair');
  });

  it('filters by tier and status and orders by creation time then id', async () => {
    const repository = createRepository();
    const inactive = passenger('pas-b', MembershipTier.GOLD, EARLY);
    inactive.deactivate(LATER);
    await repository.save(passenger('pas-c', MembershipTier.SILVER, LATER));
    await repository.save(inactive);
    await repository.save(passenger('pas-a', MembershipTier.GOLD, EARLY));

    const gold = await repository.search({ tier: 'GOLD' });
    expect(gold.map((item) => item.id)).toEqual(['pas-a', 'pas-b']);

    const activeGold = await repository.search({ tier: 'GOLD', status: 'ACTIVE' });
    expect(activeGold.map((item) => item.id)).toEqual(['pas-a']);

    const everyone = await repository.search({});
    expect(everyone.map((item) => item.id)).toEqual(['pas-a', 'pas-b', 'pas-c']);
  });
}
