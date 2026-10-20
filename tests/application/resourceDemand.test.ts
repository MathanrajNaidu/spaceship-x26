import { describe, expect, it } from 'vitest';

import type { Actor } from '../../src/application/auth/Actor.js';
import { Authorizer } from '../../src/application/auth/Authorizer.js';
import { KeyedMutex } from '../../src/application/concurrency/KeyedMutex.js';
import { PassengerService } from '../../src/application/services/PassengerService.js';
import { ReportingService } from '../../src/application/services/ReportingService.js';
import { ResourceService } from '../../src/application/services/ResourceService.js';
import { UsageService } from '../../src/application/services/UsageService.js';
import { TierAccessPolicy } from '../../src/domain/access/TierAccessPolicy.js';
import { AuditEntry } from '../../src/domain/audit/AuditEntry.js';
import { AuthorizationError } from '../../src/domain/errors/AuthorizationError.js';
import { InvalidTimeRangeError } from '../../src/domain/errors/ValidationError.js';
import { InProcessEventBus } from '../../src/infrastructure/events/InProcessEventBus.js';
import { InMemoryAuditLogRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryAuditLogRepository.js';
import { InMemoryPassengerRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryPassengerRepository.js';
import { InMemoryResourceRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryResourceRepository.js';
import { InMemoryUsageSessionRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryUsageSessionRepository.js';
import { FakeClock } from '../support/FakeClock.js';
import { SequentialIdGenerator } from '../support/SequentialIdGenerator.js';

const crew: Actor = { id: 'crew-ada', role: 'CREW_LEAD', name: 'Ada Okonkwo' };
const thresholds = { highUtilisation: 0.8, highDenials: 3, lowUtilisation: 0.2 };

function harness() {
  const clock = new FakeClock(new Date('2026-06-01T08:00:00.000Z'));
  const ids = new SequentialIdGenerator();
  const passengers = new InMemoryPassengerRepository();
  const resources = new InMemoryResourceRepository();
  const sessions = new InMemoryUsageSessionRepository();
  const audit = new InMemoryAuditLogRepository();
  const events = new InProcessEventBus();
  const authorizer = new Authorizer();
  const mutex = new KeyedMutex();
  return {
    clock,
    audit,
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
      audit,
      thresholds,
    ),
  };
}

describe('resource demand', () => {
  it('classifies peak pressure, repeated denials and idle resources, including retired ones', async () => {
    const { clock, audit, passengerService, resourceService, usageService, reporting } = harness();
    const pod = await resourceService.provision(crew, {
      name: 'Sleeping Pod 1',
      type: 'SLEEPING_POD',
      capacity: 1,
    });
    const gym = await resourceService.provision(crew, {
      name: 'Gym',
      type: 'FITNESS_CENTER',
      capacity: 10,
    });
    const galley = await resourceService.provision(crew, {
      name: 'Galley',
      type: 'FOOD_STATION',
      capacity: 4,
    });
    const jonah = await passengerService.create(crew, { name: 'Jonah Hale', tier: 'SILVER' });
    const priya = await passengerService.create(crew, { name: 'Priya Nair', tier: 'SILVER' });
    const elena = await passengerService.create(crew, { name: 'Elena Voss', tier: 'SILVER' });
    const jonahActor: Actor = { id: jonah.id, role: 'PASSENGER', name: jonah.name };
    const priyaActor: Actor = { id: priya.id, role: 'PASSENGER', name: priya.name };
    await usageService.startUsage(jonahActor, pod.id);
    const gymSession = await usageService.startUsage(priyaActor, gym.id);
    clock.advance(20 * 60 * 1000);
    await usageService.endOwn(priyaActor, gymSession.id);
    for (const id of ['aud-1', 'aud-2', 'aud-3']) {
      await audit.append(
        AuditEntry.record({
          id,
          occurredAt: clock.now(),
          actorId: elena.id,
          actorRole: 'PASSENGER',
          action: 'UsageDenied',
          outcome: 'DENIED',
          resourceId: galley.id,
          reason: 'CAPACITY_EXCEEDED',
        }),
      );
    }
    await audit.append(
      AuditEntry.record({
        id: 'aud-tier',
        occurredAt: clock.now(),
        actorId: jonah.id,
        actorRole: 'PASSENGER',
        action: 'UsageDenied',
        outcome: 'DENIED',
        resourceId: galley.id,
        reason: 'TIER_ACCESS_DENIED',
      }),
    );
    await resourceService.decommission(crew, gym.id);

    const rows = await reporting.resourceDemand(crew, {});
    expect(rows.map((row) => [row.name, row.demandLevel])).toEqual([
      ['Sleeping Pod 1', 'HIGH'],
      ['Galley', 'HIGH'],
      ['Gym', 'LOW'],
    ]);
    const sleeping = rows.find((row) => row.name === 'Sleeping Pod 1');
    expect(sleeping).toMatchObject({
      currentUtilisation: 1,
      peakUtilisation: 1,
      capacityDenials: 0,
      sessions: 1,
    });
    expect(sleeping?.totalDurationMs).toBe(20 * 60 * 1000);
    expect(rows.find((row) => row.name === 'Galley')).toMatchObject({
      currentUtilisation: 0,
      peakUtilisation: 0,
      capacityDenials: 3,
      status: 'ACTIVE',
    });
    expect(rows.find((row) => row.name === 'Gym')).toMatchObject({
      status: 'DECOMMISSIONED',
      currentUtilisation: 0,
      peakUtilisation: 0.1,
      demandLevel: 'LOW',
    });

    const later = await reporting.resourceDemand(crew, {
      from: new Date('2026-07-01T00:00:00.000Z'),
      to: new Date('2026-07-02T00:00:00.000Z'),
    });
    expect(later.find((row) => row.name === 'Sleeping Pod 1')?.sessions).toBe(0);
  });

  it('rejects a passenger and a reversed window', async () => {
    const { reporting } = harness();
    const actor: Actor = { id: 'pas-1', role: 'PASSENGER', name: 'Jonah' };
    await expect(reporting.resourceDemand(actor, {})).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      reporting.resourceDemand(crew, {
        from: new Date('2026-06-02T00:00:00.000Z'),
        to: new Date('2026-06-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(InvalidTimeRangeError);
  });
});
