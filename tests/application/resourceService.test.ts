import { describe, expect, it } from 'vitest';

import type { Actor } from '../../src/application/auth/Actor.js';
import { Authorizer } from '../../src/application/auth/Authorizer.js';
import { PassengerService } from '../../src/application/services/PassengerService.js';
import { ResourceService } from '../../src/application/services/ResourceService.js';
import { AuthenticationError } from '../../src/domain/errors/AuthenticationError.js';
import { AuthorizationError } from '../../src/domain/errors/AuthorizationError.js';
import { ResourceNotFoundError } from '../../src/domain/errors/NotFoundError.js';
import {
  InvalidCapacityError,
  InvalidResourceTypeError,
  InvalidTierError,
} from '../../src/domain/errors/ValidationError.js';
import { InProcessEventBus } from '../../src/infrastructure/events/InProcessEventBus.js';
import { InMemoryPassengerRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryPassengerRepository.js';
import { InMemoryResourceRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryResourceRepository.js';
import { FakeClock } from '../support/FakeClock.js';
import { SequentialIdGenerator } from '../support/SequentialIdGenerator.js';

const crew: Actor = { id: 'crew-ada', role: 'CREW_LEAD', name: 'Ada Okonkwo' };

function harness() {
  const clock = new FakeClock(new Date('2026-04-01T00:00:00.000Z'));
  const ids = new SequentialIdGenerator();
  const passengers = new InMemoryPassengerRepository();
  const resources = new InMemoryResourceRepository();
  const authorizer = new Authorizer();
  const events = new InProcessEventBus();
  const passengerService = new PassengerService(authorizer, passengers, ids, clock, events);
  const resourceService = new ResourceService(
    authorizer,
    resources,
    passengers,
    ids,
    clock,
    events,
  );
  return { clock, passengers, resources, passengerService, resourceService };
}

describe('ResourceService', () => {
  it('provisions resources, applying the type default or an explicit minimum tier', async () => {
    const { resourceService } = harness();
    const food = await resourceService.provision(crew, {
      name: 'Food Station Alpha',
      type: 'FOOD_STATION',
      capacity: 8,
    });
    expect(food.id).toBe('res-1');
    expect(food.minimumTier.name).toBe('SILVER');

    const fitness = await resourceService.provision(crew, {
      name: 'Officers Gym',
      type: 'FITNESS_CENTER',
      capacity: 2,
      minimumTier: 'PLATINUM',
    });
    expect(fitness.minimumTier.name).toBe('PLATINUM');

    const details = await resourceService.get(crew, food.id);
    expect(details.occupancy).toEqual({ active: 0, capacity: 8, availableSlots: 8 });

    const page = await resourceService.list(crew, { limit: 1, offset: 0 });
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(1);
    const platinum = await resourceService.list(crew, {
      minimumTier: 'PLATINUM',
      type: 'FITNESS_CENTER',
      status: 'ACTIVE',
      limit: 10,
      offset: 0,
    });
    expect(platinum.items.map((item) => item.id)).toEqual([fitness.id]);
  });

  it('rejects unknown types, bad capacity, bad tier overrides and missing resources', async () => {
    const { resourceService } = harness();
    await expect(
      resourceService.provision(crew, { name: 'Warp', type: 'WARP_DRIVE', capacity: 1 }),
    ).rejects.toBeInstanceOf(InvalidResourceTypeError);
    await expect(
      resourceService.provision(crew, { name: 'Food', type: 'FOOD_STATION', capacity: 0 }),
    ).rejects.toBeInstanceOf(InvalidCapacityError);
    await expect(
      resourceService.provision(crew, {
        name: 'Food',
        type: 'FOOD_STATION',
        capacity: 1,
        minimumTier: 'DIAMOND',
      }),
    ).rejects.toBeInstanceOf(InvalidTierError);
    await expect(resourceService.get(crew, 'missing')).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
  });

  it('shows each passenger only the active resources their tier can access', async () => {
    const { resourceService, passengerService, resources, clock } = harness();
    await resourceService.provision(crew, {
      name: 'Food Station Alpha',
      type: 'FOOD_STATION',
      capacity: 4,
    });
    await resourceService.provision(crew, {
      name: 'Private Cabin 1',
      type: 'PRIVATE_CABIN',
      capacity: 1,
    });
    const luxury = await resourceService.provision(crew, {
      name: 'Luxury O2 Pod A',
      type: 'LUXURY_O2_POD',
      capacity: 1,
    });
    const hygiene = await resourceService.provision(crew, {
      name: 'Hygiene Pod',
      type: 'BASIC_HYGIENE',
      capacity: 2,
    });
    const stored = await resources.findById(hygiene.id);
    stored?.decommission(clock.now());
    if (!stored) {
      throw new Error('expected resource');
    }
    await resources.save(stored);

    const silver = await passengerService.create(crew, { name: 'Jonah Hale', tier: 'SILVER' });
    const gold = await passengerService.create(crew, { name: 'Priya Nair', tier: 'GOLD' });
    const platinum = await passengerService.create(crew, { name: 'Elena Voss', tier: 'PLATINUM' });

    const silverView = await resourceService.discover(actor(silver.id, silver.name), {
      limit: 10,
      offset: 0,
    });
    expect(silverView.items.map((item) => item.resource.name)).toEqual(['Food Station Alpha']);
    expect(silverView.items[0]?.availableSlots).toBe(4);
    expect(silverView.total).toBe(1);

    const goldView = await resourceService.discover(actor(gold.id, gold.name), {
      limit: 1,
      offset: 1,
    });
    expect(goldView.total).toBe(2);
    expect(goldView.items.map((item) => item.resource.name)).toEqual(['Private Cabin 1']);

    const platinumView = await resourceService.discover(actor(platinum.id, platinum.name), {
      limit: 10,
      offset: 0,
    });
    expect(platinumView.items.map((item) => item.resource.id)).toEqual([
      'res-1',
      'res-2',
      luxury.id,
    ]);
    expect(platinumView.items.map((item) => item.resource.name)).not.toContain('Hygiene Pod');
  });

  it('returns an empty catalogue rather than an error when nothing is accessible', async () => {
    const { resourceService, passengerService } = harness();
    const silver = await passengerService.create(crew, { name: 'Jonah Hale', tier: 'SILVER' });
    await resourceService.provision(crew, {
      name: 'VIP Rec Deck',
      type: 'VIP_REC_DECK',
      capacity: 2,
    });
    const page = await resourceService.discover(actor(silver.id, silver.name), {
      limit: 10,
      offset: 0,
    });
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });

  it('rejects the wrong role and an inactive or missing passenger', async () => {
    const { resourceService, passengerService, passengers, clock } = harness();
    await expect(
      resourceService.provision(actor('pas-x', 'Jonah'), {
        name: 'Food',
        type: 'FOOD_STATION',
        capacity: 1,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(resourceService.discover(crew, { limit: 10, offset: 0 })).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    await expect(
      resourceService.discover(actor('missing', 'Nobody'), { limit: 10, offset: 0 }),
    ).rejects.toBeInstanceOf(AuthenticationError);

    const created = await passengerService.create(crew, { name: 'Jonah Hale', tier: 'SILVER' });
    const stored = await passengers.findById(created.id);
    stored?.deactivate(clock.now());
    if (!stored) {
      throw new Error('expected passenger');
    }
    await passengers.save(stored);
    await expect(
      resourceService.discover(actor(created.id, created.name), { limit: 10, offset: 0 }),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('keeps a caller-supplied id when seeding', async () => {
    const { resourceService } = harness();
    const seeded = await resourceService.provision(crew, {
      id: 'res-food-1',
      name: 'Food Station Alpha',
      type: 'FOOD_STATION',
      capacity: 8,
    });
    expect(seeded.id).toBe('res-food-1');
  });
});

function actor(id: string, name: string): Actor {
  return { id, role: 'PASSENGER', name };
}
