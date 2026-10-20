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
import { InProcessEventBus } from '../../src/infrastructure/events/InProcessEventBus.js';
import { InMemoryAuditLogRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryAuditLogRepository.js';
import { InMemoryPassengerRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryPassengerRepository.js';
import { InMemoryResourceRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryResourceRepository.js';
import { InMemoryUsageSessionRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryUsageSessionRepository.js';
import { FakeClock } from '../support/FakeClock.js';
import { SequentialIdGenerator } from '../support/SequentialIdGenerator.js';

const crew: Actor = { id: 'crew-ada', role: 'CREW_LEAD', name: 'Ada Okonkwo' };

describe('active usage snapshot', () => {
  it('lists live occupancy for active resources only', async () => {
    const clock = new FakeClock(new Date('2026-06-01T08:00:00.000Z'));
    const ids = new SequentialIdGenerator();
    const passengers = new InMemoryPassengerRepository();
    const resources = new InMemoryResourceRepository();
    const sessions = new InMemoryUsageSessionRepository();
    const events = new InProcessEventBus();
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
    const reporting = new ReportingService(
      authorizer,
      passengers,
      resources,
      sessions,
      clock,
      new InMemoryAuditLogRepository(),
      {
        highUtilisation: 0.8,
        highDenials: 3,
        lowUtilisation: 0.2,
      },
    );
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
    await resourceService.decommission(crew, pod.id);

    const snapshot = await reporting.activeUsage(crew);
    expect(snapshot.generatedAt.toISOString()).toBe('2026-06-01T08:00:00.000Z');
    expect(snapshot.resources.map((row) => row.resource.id)).toEqual([food.id]);
    expect(snapshot.resources[0]?.occupancy).toEqual({ active: 1, capacity: 2, availableSlots: 1 });
    expect(snapshot.resources[0]?.sessions).toHaveLength(1);
    await expect(reporting.activeUsage(actor)).rejects.toBeInstanceOf(AuthorizationError);
  });
});
