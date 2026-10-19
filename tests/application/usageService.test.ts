import { describe, expect, it } from 'vitest';

import { Authorizer } from '../../src/application/auth/Authorizer.js';
import type { Actor } from '../../src/application/auth/Actor.js';
import { PassengerService } from '../../src/application/services/PassengerService.js';
import { ResourceService } from '../../src/application/services/ResourceService.js';
import { UsageService } from '../../src/application/services/UsageService.js';
import { TierAccessPolicy } from '../../src/domain/access/TierAccessPolicy.js';
import { AccessDeniedError } from '../../src/domain/errors/AccessDeniedError.js';
import { AuthenticationError } from '../../src/domain/errors/AuthenticationError.js';
import { AuthorizationError } from '../../src/domain/errors/AuthorizationError.js';
import {
  CapacityExceededError,
  ResourceDecommissionedError,
  SessionAlreadyActiveError,
} from '../../src/domain/errors/ConflictError.js';
import { ResourceNotFoundError } from '../../src/domain/errors/NotFoundError.js';
import { InMemoryPassengerRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryPassengerRepository.js';
import { InMemoryResourceRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryResourceRepository.js';
import { InMemoryUsageSessionRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryUsageSessionRepository.js';
import { FakeClock } from '../support/FakeClock.js';
import { SequentialIdGenerator } from '../support/SequentialIdGenerator.js';

const crew: Actor = { id: 'crew-ada', role: 'CREW_LEAD', name: 'Ada Okonkwo' };

function harness() {
  const clock = new FakeClock(new Date('2026-06-01T12:00:00.000Z'));
  const ids = new SequentialIdGenerator();
  const passengers = new InMemoryPassengerRepository();
  const resources = new InMemoryResourceRepository();
  const sessions = new InMemoryUsageSessionRepository();
  const authorizer = new Authorizer();
  const passengerService = new PassengerService(authorizer, passengers, ids, clock);
  const resourceService = new ResourceService(authorizer, resources, passengers, ids, clock);
  const usageService = new UsageService(
    authorizer,
    passengers,
    resources,
    sessions,
    new TierAccessPolicy(),
    ids,
    clock,
  );
  return {
    clock,
    passengers,
    resources,
    sessions,
    passengerService,
    resourceService,
    usageService,
  };
}

function passengerActor(id: string, name: string): Actor {
  return { id, role: 'PASSENGER', name };
}

describe('UsageService.startUsage', () => {
  it('starts a session when the tier, status and capacity all allow it', async () => {
    const { usageService, passengerService, resourceService, clock } = harness();
    const food = await resourceService.provision(crew, {
      name: 'Food Station Alpha',
      type: 'FOOD_STATION',
      capacity: 2,
    });
    const jonah = await passengerService.create(crew, { name: 'Jonah Hale', tier: 'SILVER' });
    const session = await usageService.startUsage(passengerActor(jonah.id, jonah.name), food.id);
    expect(session.id).toBe('ses-1');
    expect(session.tierAtStart.name).toBe('SILVER');
    expect(session.isActive).toBe(true);
    clock.advance(5_000);
    expect(session.durationMs(clock.now())).toBe(5_000);

    const cabin = await resourceService.provision(crew, {
      name: 'Private Cabin 1',
      type: 'PRIVATE_CABIN',
      capacity: 1,
    });
    const priya = await passengerService.create(crew, { name: 'Priya Nair', tier: 'GOLD' });
    const second = await usageService.startUsage(passengerActor(priya.id, priya.name), cabin.id);
    expect(second.resourceId).toBe(cabin.id);
    const alsoFood = await usageService.startUsage(passengerActor(priya.id, priya.name), food.id);
    expect(alsoFood.resourceId).toBe(food.id);
  });

  it('denies a tier that is too low, a duplicate session, and a full resource', async () => {
    const { usageService, passengerService, resourceService, sessions, clock } = harness();
    const luxury = await resourceService.provision(crew, {
      name: 'Luxury O2 Pod A',
      type: 'LUXURY_O2_POD',
      capacity: 1,
    });
    const jonah = await passengerService.create(crew, { name: 'Jonah Hale', tier: 'SILVER' });
    const elena = await passengerService.create(crew, { name: 'Elena Voss', tier: 'PLATINUM' });
    await expect(
      usageService.startUsage(passengerActor(jonah.id, jonah.name), luxury.id),
    ).rejects.toBeInstanceOf(AccessDeniedError);

    const started = await usageService.startUsage(passengerActor(elena.id, elena.name), luxury.id);
    await expect(
      usageService.startUsage(passengerActor(elena.id, elena.name), luxury.id),
    ).rejects.toBeInstanceOf(SessionAlreadyActiveError);
    const other = await passengerService.create(crew, { name: 'Bao Guest', tier: 'PLATINUM' });
    await expect(
      usageService.startUsage(passengerActor(other.id, other.name), luxury.id),
    ).rejects.toBeInstanceOf(CapacityExceededError);

    const stored = await sessions.findById(started.id);
    stored?.end(clock.now(), 'PASSENGER_ENDED');
    if (!stored) {
      throw new Error('expected session');
    }
    await sessions.save(stored);
    const again = await usageService.startUsage(passengerActor(other.id, other.name), luxury.id);
    expect(again.isActive).toBe(true);
  });

  it('rejects a missing, decommissioned, inactive or unauthenticated start', async () => {
    const { usageService, passengerService, resourceService, passengers, resources, clock } =
      harness();
    await expect(
      usageService.startUsage(passengerActor('missing', 'Nobody'), 'res-x'),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
    const luxury = await resourceService.provision(crew, {
      name: 'Luxury O2 Pod A',
      type: 'LUXURY_O2_POD',
      capacity: 1,
    });
    const storedResource = await resources.findById(luxury.id);
    storedResource?.decommission(clock.now());
    if (!storedResource) {
      throw new Error('expected resource');
    }
    await resources.save(storedResource);
    const jonah = await passengerService.create(crew, { name: 'Jonah Hale', tier: 'SILVER' });
    await expect(
      usageService.startUsage(passengerActor(jonah.id, jonah.name), luxury.id),
    ).rejects.toBeInstanceOf(ResourceDecommissionedError);

    const food = await resourceService.provision(crew, {
      name: 'Food Station Alpha',
      type: 'FOOD_STATION',
      capacity: 1,
    });
    const storedPassenger = await passengers.findById(jonah.id);
    storedPassenger?.deactivate(clock.now());
    if (!storedPassenger) {
      throw new Error('expected passenger');
    }
    await passengers.save(storedPassenger);
    await expect(
      usageService.startUsage(passengerActor(jonah.id, jonah.name), food.id),
    ).rejects.toBeInstanceOf(AuthenticationError);
    await expect(
      usageService.startUsage(passengerActor('ghost', 'Ghost'), food.id),
    ).rejects.toBeInstanceOf(AuthenticationError);
    await expect(usageService.startUsage(crew, food.id)).rejects.toBeInstanceOf(AuthorizationError);
  });
});
