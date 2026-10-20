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
import { AuthorizationError } from '../../src/domain/errors/AuthorizationError.js';
import {
  PassengerInactiveError,
  TierUnchangedError,
} from '../../src/domain/errors/ConflictError.js';
import { PassengerNotFoundError } from '../../src/domain/errors/NotFoundError.js';
import { InvalidTierError } from '../../src/domain/errors/ValidationError.js';
import { UsageSession } from '../../src/domain/usage/UsageSession.js';
import { MembershipTier } from '../../src/domain/tier/MembershipTier.js';
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
  const passengerService = new PassengerService(
    authorizer,
    passengers,
    ids,
    clock,
    events,
    sessions,
    resources,
    mutex,
  );
  const resourceService = new ResourceService(
    authorizer,
    resources,
    passengers,
    ids,
    clock,
    events,
    sessions,
    mutex,
  );
  const usageService = new UsageService(
    authorizer,
    passengers,
    resources,
    sessions,
    new TierAccessPolicy(),
    ids,
    clock,
    mutex,
    events,
  );
  return {
    clock,
    passengers,
    sessions,
    passengerService,
    resourceService,
    usageService,
    audit: new AuditService(authorizer, auditLog),
  };
}

describe('PassengerService.changeTier', () => {
  it('ends sessions that the new tier cannot access and keeps the rest', async () => {
    const { passengerService, resourceService, usageService, audit } = harness();
    const food = await resourceService.provision(crew, {
      name: 'Food Station Alpha',
      type: 'FOOD_STATION',
      capacity: 1,
    });
    const cabin = await resourceService.provision(crew, {
      name: 'Private Cabin 1',
      type: 'PRIVATE_CABIN',
      capacity: 1,
    });
    const vip = await resourceService.provision(crew, {
      name: 'VIP Rec Deck',
      type: 'VIP_REC_DECK',
      capacity: 1,
    });
    const elena = await passengerService.create(crew, { name: 'Elena Voss', tier: 'PLATINUM' });
    const actor: Actor = { id: elena.id, role: 'PASSENGER', name: elena.name };
    const foodSession = await usageService.startUsage(actor, food.id);
    await usageService.startUsage(actor, cabin.id);
    await usageService.startUsage(actor, vip.id);

    const result = await passengerService.changeTier(crew, elena.id, 'SILVER');
    expect(result.change).toMatchObject({ direction: 'DOWNGRADE' });
    expect(result.change.from.name).toBe('PLATINUM');
    expect(result.change.to.name).toBe('SILVER');
    expect(result.endedSessions.map((session) => session.resourceId).sort()).toEqual(
      [cabin.id, vip.id].sort(),
    );
    expect(result.endedSessions.every((session) => session.endReason === 'TIER_DOWNGRADED')).toBe(
      true,
    );
    expect((await usageService.listOwn(actor, 'active')).map((session) => session.id)).toEqual([
      foodSession.id,
    ]);

    const upgrade = await passengerService.changeTier(crew, elena.id, 'PLATINUM');
    expect(upgrade.change.direction).toBe('UPGRADE');
    expect(upgrade.endedSessions).toEqual([]);
    expect(await usageService.listOwn(actor, 'active')).toHaveLength(1);
    const cabinAgain = await usageService.startUsage(actor, cabin.id);
    expect(cabinAgain.isActive).toBe(true);

    const ended = await audit.query(crew, { action: 'UsageEnded', limit: 10, offset: 0 });
    expect(ended.items.every((item) => item.reason === 'TIER_DOWNGRADED')).toBe(true);
    expect(ended.total).toBe(2);
  });

  it('rejects an unchanged tier, an inactive passenger, a bad tier and the wrong role', async () => {
    const { passengerService, passengers, clock } = harness();
    const jonah = await passengerService.create(crew, { name: 'Jonah Hale', tier: 'GOLD' });
    await expect(passengerService.changeTier(crew, jonah.id, 'GOLD')).rejects.toBeInstanceOf(
      TierUnchangedError,
    );
    await expect(passengerService.changeTier(crew, jonah.id, 'DIAMOND')).rejects.toBeInstanceOf(
      InvalidTierError,
    );
    const stored = await passengers.findById(jonah.id);
    stored?.deactivate(clock.now());
    if (!stored) {
      throw new Error('expected passenger');
    }
    await passengers.save(stored);
    await expect(passengerService.changeTier(crew, jonah.id, 'SILVER')).rejects.toBeInstanceOf(
      PassengerInactiveError,
    );
    const actor: Actor = { id: jonah.id, role: 'PASSENGER', name: jonah.name };
    await expect(passengerService.changeTier(actor, jonah.id, 'PLATINUM')).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    await expect(passengerService.changeTier(crew, 'missing', 'SILVER')).rejects.toBeInstanceOf(
      PassengerNotFoundError,
    );
  });

  it('skips a session whose resource is gone or whose session ended before the lock', async () => {
    const { passengerService, resourceService, usageService, sessions, clock } = harness();
    const food = await resourceService.provision(crew, {
      name: 'Food Station Alpha',
      type: 'FOOD_STATION',
      capacity: 2,
    });
    const cabin = await resourceService.provision(crew, {
      name: 'Private Cabin 1',
      type: 'PRIVATE_CABIN',
      capacity: 1,
    });
    const elena = await passengerService.create(crew, { name: 'Elena Voss', tier: 'PLATINUM' });
    const actor: Actor = { id: elena.id, role: 'PASSENGER', name: elena.name };
    await usageService.startUsage(actor, food.id);
    const cabinSession = await usageService.startUsage(actor, cabin.id);
    await sessions.save(
      UsageSession.start({
        id: 'ses-orphan',
        passengerId: elena.id,
        resourceId: 'res-missing',
        tierAtStart: MembershipTier.PLATINUM,
        now: clock.now(),
      }),
    );
    const original = sessions.findById.bind(sessions);
    sessions.findById = (id: string) => {
      if (id === cabinSession.id) {
        return Promise.resolve(null);
      }
      return original(id);
    };
    const result = await passengerService.changeTier(crew, elena.id, 'SILVER');
    expect(result.endedSessions).toEqual([]);
    const orphan = await original('ses-orphan');
    expect(orphan?.isActive).toBe(true);
  });
});
