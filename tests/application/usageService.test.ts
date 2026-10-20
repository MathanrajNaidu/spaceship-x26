import { describe, expect, it } from 'vitest';

import { Authorizer } from '../../src/application/auth/Authorizer.js';
import type { Actor } from '../../src/application/auth/Actor.js';
import { KeyedMutex } from '../../src/application/concurrency/KeyedMutex.js';
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
  SessionAlreadyEndedError,
} from '../../src/domain/errors/ConflictError.js';
import {
  ResourceNotFoundError,
  SessionNotFoundError,
} from '../../src/domain/errors/NotFoundError.js';
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
    new KeyedMutex(),
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

  it('gives exactly one success when five starts race a capacity of one', async () => {
    const { usageService, passengerService, resourceService } = harness();
    const pod = await resourceService.provision(crew, {
      name: 'Sleeping Pod 1',
      type: 'SLEEPING_POD',
      capacity: 1,
    });
    const actors = [];
    for (const name of ['Ada Guest', 'Bao Guest', 'Mira Guest', 'Jonah Hale', 'Priya Nair']) {
      const passenger = await passengerService.create(crew, { name, tier: 'SILVER' });
      actors.push(passengerActor(passenger.id, passenger.name));
    }
    const results = await Promise.allSettled(
      actors.map((actor) => usageService.startUsage(actor, pod.id)),
    );
    const successes = results.filter((result) => result.status === 'fulfilled');
    const denials = results.filter(
      (result) => result.status === 'rejected' && result.reason instanceof CapacityExceededError,
    );
    expect(successes).toHaveLength(1);
    expect(denials).toHaveLength(4);
  });
});

describe('UsageService.endUsage', () => {
  it('lets a passenger end their own session and lists it as ended', async () => {
    const { usageService, passengerService, resourceService, clock, sessions } = harness();
    const food = await resourceService.provision(crew, {
      name: 'Food Station Alpha',
      type: 'FOOD_STATION',
      capacity: 2,
    });
    const jonah = await passengerService.create(crew, { name: 'Jonah Hale', tier: 'SILVER' });
    const actor = passengerActor(jonah.id, jonah.name);
    const started = await usageService.startUsage(actor, food.id);
    clock.advance(90_000);
    const ended = await usageService.endOwn(actor, started.id);
    expect(ended.endReason).toBe('PASSENGER_ENDED');
    expect(ended.durationMs(clock.now())).toBe(90_000);
    const stored = await sessions.findById(started.id);
    expect(stored?.isActive).toBe(false);
    await expect(usageService.listOwn(actor, 'ended')).resolves.toHaveLength(1);
    await expect(usageService.listOwn(actor, 'active')).resolves.toHaveLength(0);
    await expect(usageService.endOwn(actor, started.id)).rejects.toBeInstanceOf(
      SessionAlreadyEndedError,
    );
  });

  it('hides another passenger session as not found and lets crew end any session', async () => {
    const { usageService, passengerService, resourceService } = harness();
    const food = await resourceService.provision(crew, {
      name: 'Food Station Alpha',
      type: 'FOOD_STATION',
      capacity: 2,
    });
    const jonah = await passengerService.create(crew, { name: 'Jonah Hale', tier: 'SILVER' });
    const priya = await passengerService.create(crew, { name: 'Priya Nair', tier: 'GOLD' });
    const started = await usageService.startUsage(passengerActor(jonah.id, jonah.name), food.id);
    await expect(
      usageService.endOwn(passengerActor(priya.id, priya.name), started.id),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
    await expect(
      usageService.endOwn(passengerActor(jonah.id, jonah.name), 'ses-missing'),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
    await expect(usageService.endByCrew(crew, 'ses-missing')).rejects.toBeInstanceOf(
      SessionNotFoundError,
    );
    const ended = await usageService.endByCrew(crew, started.id);
    expect(ended.endReason).toBe('CREW_ENDED');
    await expect(usageService.endByCrew(crew, started.id)).rejects.toBeInstanceOf(
      SessionAlreadyEndedError,
    );
    await expect(usageService.endOwn(crew, started.id)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      usageService.endByCrew(passengerActor(jonah.id, jonah.name), started.id),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(usageService.listOwn(crew)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('treats a session that disappears while waiting for the resource lock as not found', async () => {
    const { usageService, passengerService, resourceService, sessions } = harness();
    const food = await resourceService.provision(crew, {
      name: 'Food Station Alpha',
      type: 'FOOD_STATION',
      capacity: 1,
    });
    const jonah = await passengerService.create(crew, { name: 'Jonah Hale', tier: 'SILVER' });
    const actor = passengerActor(jonah.id, jonah.name);
    const started = await usageService.startUsage(actor, food.id);
    const original = sessions.findById.bind(sessions);
    let reads = 0;
    sessions.findById = (id: string) => {
      reads += 1;
      if (reads > 1) {
        return Promise.resolve(null);
      }
      return original(id);
    };
    await expect(usageService.endOwn(actor, started.id)).rejects.toBeInstanceOf(
      SessionNotFoundError,
    );
  });
});
