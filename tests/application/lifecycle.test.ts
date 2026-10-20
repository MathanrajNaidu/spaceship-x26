import { describe, expect, it } from 'vitest';

import type { Actor } from '../../src/application/auth/Actor.js';
import { Authorizer } from '../../src/application/auth/Authorizer.js';
import { KeyedMutex } from '../../src/application/concurrency/KeyedMutex.js';
import { AuditService } from '../../src/application/services/AuditService.js';
import { PassengerService } from '../../src/application/services/PassengerService.js';
import { ResourceService } from '../../src/application/services/ResourceService.js';
import { UsageService } from '../../src/application/services/UsageService.js';
import { AuditLogSubscriber } from '../../src/application/subscribers/AuditLogSubscriber.js';
import { TierAccessPolicy } from '../../src/domain/access/TierAccessPolicy.js';
import { AuthenticationError } from '../../src/domain/errors/AuthenticationError.js';
import { AuthorizationError } from '../../src/domain/errors/AuthorizationError.js';
import {
  PassengerInactiveError,
  ResourceDecommissionedError,
  ResourceInUseError,
} from '../../src/domain/errors/ConflictError.js';
import {
  PassengerNotFoundError,
  ResourceNotFoundError,
} from '../../src/domain/errors/NotFoundError.js';
import { InProcessEventBus } from '../../src/infrastructure/events/InProcessEventBus.js';
import { InMemoryAuditLogRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryAuditLogRepository.js';
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
  const auditLog = new InMemoryAuditLogRepository();
  const events = new InProcessEventBus();
  events.subscribe(new AuditLogSubscriber(auditLog, ids));
  const authorizer = new Authorizer();
  const mutex = new KeyedMutex();
  return {
    passengerService: new PassengerService(
      authorizer,
      passengers,
      ids,
      clock,
      events,
      sessions,
      resources,
      mutex,
    ),
    resourceService: new ResourceService(
      authorizer,
      resources,
      passengers,
      ids,
      clock,
      events,
      sessions,
      mutex,
    ),
    usageService: new UsageService(
      authorizer,
      passengers,
      resources,
      sessions,
      new TierAccessPolicy(),
      ids,
      clock,
      mutex,
      events,
    ),
    audit: new AuditService(authorizer, auditLog),
  };
}

describe('passenger deactivation and resource decommission', () => {
  it('ends active sessions when a passenger is deactivated', async () => {
    const { passengerService, resourceService, usageService, audit } = harness();
    const food = await resourceService.provision(crew, {
      name: 'Food Station Alpha',
      type: 'FOOD_STATION',
      capacity: 2,
    });
    const pod = await resourceService.provision(crew, {
      name: 'Sleeping Pod 1',
      type: 'SLEEPING_POD',
      capacity: 1,
    });
    const jonah = await passengerService.create(crew, { name: 'Jonah Hale', tier: 'SILVER' });
    const actor: Actor = { id: jonah.id, role: 'PASSENGER', name: jonah.name };
    await usageService.startUsage(actor, food.id);
    await usageService.startUsage(actor, pod.id);
    const result = await passengerService.deactivate(crew, jonah.id);
    expect(result.passenger.status).toBe('INACTIVE');
    expect(result.endedSessions).toHaveLength(2);
    expect(
      result.endedSessions.every((session) => session.endReason === 'PASSENGER_DEACTIVATED'),
    ).toBe(true);
    await expect(usageService.startUsage(actor, food.id)).rejects.toBeInstanceOf(
      AuthenticationError,
    );
    await expect(passengerService.deactivate(crew, jonah.id)).rejects.toBeInstanceOf(
      PassengerInactiveError,
    );
    await expect(passengerService.deactivate(actor, jonah.id)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    await expect(passengerService.deactivate(crew, 'missing')).rejects.toBeInstanceOf(
      PassengerNotFoundError,
    );
    const ended = await audit.query(crew, { action: 'UsageEnded', limit: 10, offset: 0 });
    expect(ended.items.every((item) => item.reason === 'PASSENGER_DEACTIVATED')).toBe(true);
    const deactivated = await audit.query(crew, {
      action: 'PassengerDeactivated',
      limit: 10,
      offset: 0,
    });
    expect(deactivated.total).toBe(1);
  });

  it('refuses to decommission a resource that is in use, then retires it once it is free', async () => {
    const { passengerService, resourceService, usageService, audit } = harness();
    const food = await resourceService.provision(crew, {
      name: 'Food Station Alpha',
      type: 'FOOD_STATION',
      capacity: 2,
    });
    const jonah = await passengerService.create(crew, { name: 'Jonah Hale', tier: 'SILVER' });
    const priya = await passengerService.create(crew, { name: 'Priya Nair', tier: 'GOLD' });
    const jonahActor: Actor = { id: jonah.id, role: 'PASSENGER', name: jonah.name };
    const priyaActor: Actor = { id: priya.id, role: 'PASSENGER', name: priya.name };
    const first = await usageService.startUsage(jonahActor, food.id);
    await usageService.startUsage(priyaActor, food.id);
    await expect(resourceService.decommission(crew, food.id)).rejects.toThrow(
      /2 sessions are active/,
    );
    const busy = await resourceService.get(crew, food.id);
    expect(busy.occupancy).toEqual({ active: 2, capacity: 2, availableSlots: 0 });
    const discovered = await resourceService.discover(jonahActor, { limit: 10, offset: 0 });
    expect(discovered.items.find((item) => item.resource.id === food.id)?.availableSlots).toBe(0);
    await usageService.endByCrew(crew, first.id);
    await expect(resourceService.decommission(crew, food.id)).rejects.toBeInstanceOf(
      ResourceInUseError,
    );
    const remaining = await usageService.listOwn(priyaActor, 'active');
    const open = remaining[0];
    if (!open) {
      throw new Error('expected session');
    }
    await usageService.endByCrew(crew, open.id);
    const retired = await resourceService.decommission(crew, food.id);
    expect(retired.status).toBe('DECOMMISSIONED');
    const details = await resourceService.get(crew, food.id);
    expect(details.resource.status).toBe('DECOMMISSIONED');
    expect(details.occupancy.active).toBe(0);
    await expect(resourceService.decommission(crew, food.id)).rejects.toBeInstanceOf(
      ResourceDecommissionedError,
    );
    await expect(usageService.startUsage(jonahActor, food.id)).rejects.toBeInstanceOf(
      ResourceDecommissionedError,
    );
    expect(await usageService.listOwn(jonahActor, 'ended')).toHaveLength(1);
    await expect(resourceService.decommission(jonahActor, food.id)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    await expect(resourceService.decommission(crew, 'missing')).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
    const recorded = await audit.query(crew, {
      action: 'ResourceDecommissioned',
      limit: 5,
      offset: 0,
    });
    expect(recorded.total).toBe(1);
  });
});
