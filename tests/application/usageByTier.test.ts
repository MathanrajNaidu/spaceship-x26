import { describe, expect, it } from 'vitest';

import type { Actor } from '../../src/application/auth/Actor.js';
import { Authorizer } from '../../src/application/auth/Authorizer.js';
import { KeyedMutex } from '../../src/application/concurrency/KeyedMutex.js';
import { PassengerService } from '../../src/application/services/PassengerService.js';
import { ReportingService } from '../../src/application/services/ReportingService.js';
import { ResourceService } from '../../src/application/services/ResourceService.js';
import { UsageService } from '../../src/application/services/UsageService.js';
import { TierAccessPolicy } from '../../src/domain/access/TierAccessPolicy.js';
import { AuthorizationError } from '../../src/domain/errors/AuthorizationError.js';
import { InvalidTimeRangeError } from '../../src/domain/errors/ValidationError.js';
import { TIERS } from '../../src/domain/tier/MembershipTier.js';
import { InProcessEventBus } from '../../src/infrastructure/events/InProcessEventBus.js';
import { InMemoryAuditLogRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryAuditLogRepository.js';
import { InMemoryPassengerRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryPassengerRepository.js';
import { InMemoryResourceRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryResourceRepository.js';
import { InMemoryUsageSessionRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryUsageSessionRepository.js';
import { FakeClock } from '../support/FakeClock.js';
import { SequentialIdGenerator } from '../support/SequentialIdGenerator.js';

const crew: Actor = { id: 'crew-ada', role: 'CREW_LEAD', name: 'Ada Okonkwo' };

function harness() {
  const clock = new FakeClock(new Date('2026-06-01T08:00:00.000Z'));
  const ids = new SequentialIdGenerator();
  const passengers = new InMemoryPassengerRepository();
  const resources = new InMemoryResourceRepository();
  const sessions = new InMemoryUsageSessionRepository();
  const events = new InProcessEventBus();
  const authorizer = new Authorizer();
  const mutex = new KeyedMutex();
  return {
    clock,
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
    reporting: new ReportingService(
      authorizer,
      passengers,
      resources,
      sessions,
      clock,
      new InMemoryAuditLogRepository(),
      { highUtilisation: 0.8, highDenials: 3, lowUtilisation: 0.2 },
    ),
  };
}

describe('usage by tier at time of use', () => {
  it('keeps earlier usage under the tier held when the session started', async () => {
    const { clock, passengerService, resourceService, usageService, reporting } = harness();
    const luxury = await resourceService.provision(crew, {
      name: 'Luxury O2 Pod A',
      type: 'LUXURY_O2_POD',
      capacity: 1,
    });
    const alpha = await resourceService.provision(crew, {
      name: 'Alpha Galley',
      type: 'FOOD_STATION',
      capacity: 2,
    });
    const bravo = await resourceService.provision(crew, {
      name: 'Bravo Galley',
      type: 'FOOD_STATION',
      capacity: 2,
    });
    const elena = await passengerService.create(crew, { name: 'Elena Voss', tier: 'PLATINUM' });
    const priya = await passengerService.create(crew, { name: 'Priya Nair', tier: 'SILVER' });
    const elenaActor: Actor = { id: elena.id, role: 'PASSENGER', name: elena.name };
    const priyaActor: Actor = { id: priya.id, role: 'PASSENGER', name: priya.name };
    const luxurySession = await usageService.startUsage(elenaActor, luxury.id);
    clock.advance(10 * 60 * 1000);
    await usageService.endOwn(elenaActor, luxurySession.id);
    await passengerService.changeTier(crew, elena.id, 'SILVER');
    const alphaSession = await usageService.startUsage(elenaActor, alpha.id);
    clock.advance(5 * 60 * 1000);
    await usageService.endOwn(elenaActor, alphaSession.id);
    const bravoSession = await usageService.startUsage(priyaActor, bravo.id);
    clock.advance(5 * 60 * 1000);
    await usageService.endOwn(priyaActor, bravoSession.id);

    const groups = await reporting.usageByTier(crew, {});
    expect(groups.map((group) => group.tier)).toEqual([...TIERS]);
    const platinum = groups.find((group) => group.tier === 'PLATINUM');
    const silver = groups.find((group) => group.tier === 'SILVER');
    expect(platinum).toMatchObject({
      passengerCount: 1,
      sessions: 1,
      totalDurationMs: 10 * 60 * 1000,
    });
    expect(platinum?.topResources.map((resource) => resource.name)).toEqual(['Luxury O2 Pod A']);
    expect(silver).toMatchObject({
      passengerCount: 2,
      sessions: 2,
      totalDurationMs: 10 * 60 * 1000,
    });
    expect(silver?.topResources.map((resource) => resource.name)).toEqual([
      'Alpha Galley',
      'Bravo Galley',
    ]);

    const empty = await reporting.usageByTier(crew, {
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-01-02T00:00:00.000Z'),
    });
    expect(empty.every((group) => group.sessions === 0 && group.passengerCount === 0)).toBe(true);
    expect(empty).toHaveLength(3);
  });

  it('rejects a reversed window and a passenger caller', async () => {
    const { reporting } = harness();
    const actor: Actor = { id: 'pas-1', role: 'PASSENGER', name: 'Jonah Hale' };
    await expect(reporting.usageByTier(actor, {})).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      reporting.usageByTier(crew, {
        from: new Date('2026-06-02T00:00:00.000Z'),
        to: new Date('2026-06-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(InvalidTimeRangeError);
  });
});
