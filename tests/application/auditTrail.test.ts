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
import { AccessDeniedError } from '../../src/domain/errors/AccessDeniedError.js';
import { AuthorizationError } from '../../src/domain/errors/AuthorizationError.js';
import { ResourceNotFoundError } from '../../src/domain/errors/NotFoundError.js';
import type { DomainEvent } from '../../src/domain/events/DomainEvent.js';
import { InProcessEventBus } from '../../src/infrastructure/events/InProcessEventBus.js';
import { InMemoryAuditLogRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryAuditLogRepository.js';
import { InMemoryPassengerRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryPassengerRepository.js';
import { InMemoryResourceRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryResourceRepository.js';
import { InMemoryUsageSessionRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryUsageSessionRepository.js';
import { FakeClock } from '../support/FakeClock.js';
import { SequentialIdGenerator } from '../support/SequentialIdGenerator.js';

const crew: Actor = { id: 'crew-ada', role: 'CREW_LEAD', name: 'Ada Okonkwo' };
const when = new Date('2026-06-01T12:00:00.000Z');

function harness() {
  const clock = new FakeClock(when);
  const ids = new SequentialIdGenerator();
  const passengers = new InMemoryPassengerRepository();
  const resources = new InMemoryResourceRepository();
  const sessions = new InMemoryUsageSessionRepository();
  const auditLog = new InMemoryAuditLogRepository();
  const events = new InProcessEventBus();
  events.subscribe(new AuditLogSubscriber(auditLog, ids));
  const authorizer = new Authorizer();
  return {
    clock,
    audit: new AuditService(authorizer, auditLog),
    events,
    passengerService: new PassengerService(authorizer, passengers, ids, clock, events),
    resourceService: new ResourceService(authorizer, resources, passengers, ids, clock, events),
    usageService: new UsageService(
      authorizer,
      passengers,
      resources,
      sessions,
      new TierAccessPolicy(),
      ids,
      clock,
      new KeyedMutex(),
      events,
    ),
  };
}

describe('audit trail', () => {
  it('records successful resource use and denied attempts, but not a missing resource', async () => {
    const { passengerService, resourceService, usageService, audit } = harness();
    const food = await resourceService.provision(crew, {
      name: 'Food Station Alpha',
      type: 'FOOD_STATION',
      capacity: 1,
    });
    const luxury = await resourceService.provision(crew, {
      name: 'Luxury O2 Pod A',
      type: 'LUXURY_O2_POD',
      capacity: 1,
    });
    const jonah = await passengerService.create(crew, { name: 'Jonah Hale', tier: 'SILVER' });
    await passengerService.updateName(crew, jonah.id, 'Jonah Hale Jr');
    const actor: Actor = { id: jonah.id, role: 'PASSENGER', name: 'Jonah Hale Jr' };
    await expect(usageService.startUsage(actor, 'missing')).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
    await expect(usageService.startUsage(actor, luxury.id)).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
    const session = await usageService.startUsage(actor, food.id);
    await usageService.endOwn(actor, session.id);

    const page = await audit.query(crew, { limit: 20, offset: 0 });
    expect(page.items.map((item) => [item.action, item.outcome, item.reason ?? null])).toEqual([
      ['UsageEnded', 'SUCCESS', 'PASSENGER_ENDED'],
      ['UsageStarted', 'SUCCESS', null],
      ['UsageDenied', 'DENIED', 'TIER_ACCESS_DENIED'],
      ['PassengerUpdated', 'SUCCESS', null],
      ['PassengerCreated', 'SUCCESS', null],
      ['ResourceProvisioned', 'SUCCESS', null],
      ['ResourceProvisioned', 'SUCCESS', null],
    ]);
    expect(page.items[2]?.passengerId).toBe(jonah.id);
    expect(page.items[2]?.resourceId).toBe(luxury.id);
    const denied = await audit.query(crew, {
      outcome: 'DENIED',
      passengerId: jonah.id,
      resourceId: luxury.id,
      action: 'UsageDenied',
      limit: 10,
      offset: 0,
    });
    expect(denied.total).toBe(1);
    await expect(audit.query(actor, { limit: 10, offset: 0 })).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  it('records the remaining lifecycle events when they are published', async () => {
    const { events, audit } = harness();
    const actor = { id: 'crew-ada', role: 'CREW_LEAD' as const };
    const eventsToPublish: DomainEvent[] = [
      {
        type: 'PassengerDeactivated',
        occurredAt: when,
        actor,
        passengerId: 'pas-1',
      },
      {
        type: 'PassengerTierChanged',
        occurredAt: when,
        actor,
        passengerId: 'pas-1',
        from: 'PLATINUM',
        to: 'SILVER',
        direction: 'DOWNGRADE',
      },
      {
        type: 'ResourceDecommissioned',
        occurredAt: when,
        actor,
        resourceId: 'res-1',
      },
    ];
    for (const event of eventsToPublish) {
      await events.publish(event);
    }
    const page = await audit.query(crew, { limit: 10, offset: 0 });
    expect(page.items.map((item) => item.action)).toEqual([
      'ResourceDecommissioned',
      'PassengerTierChanged',
      'PassengerDeactivated',
    ]);
    expect(page.items[1]?.metadata).toEqual({
      from: 'PLATINUM',
      to: 'SILVER',
      direction: 'DOWNGRADE',
    });
  });
});
